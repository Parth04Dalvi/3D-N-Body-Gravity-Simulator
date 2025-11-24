<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Real-Time 3D N-Body Gravity Simulator</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <!-- Three.js Library -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
    <style>
        body {
            font-family: 'Inter', sans-serif;
            margin: 0;
            overflow: hidden;
            background-color: #0d1117; /* Dark GitHub background */
            color: #c9d1d9;
        }
        #control-panel {
            position: absolute;
            top: 10px;
            right: 10px;
            padding: 15px;
            width: 300px;
            background: rgba(17, 24, 39, 0.85); /* Darker, slightly transparent panel */
            border-radius: 12px;
            backdrop-filter: blur(5px);
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.5);
            font-size: 14px;
            z-index: 100;
        }
        #info-display {
            border-bottom: 1px solid #374151;
            padding-bottom: 10px;
            margin-bottom: 10px;
        }
        canvas {
            display: block;
        }
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
    </style>
</head>
<body>
    <div id="control-panel">
        <h1 class="text-2xl font-extrabold text-blue-400 mb-4 text-center">N-Body Simulator</h1>
        
        <div id="info-display">
            <p class="flex justify-between"><span>Bodies:</span> <span id="body-count" class="font-mono">0</span></p>
            <p class="flex justify-between"><span>FPS:</span> <span id="fps-display" class="font-mono">0</span></p>
            <p class="flex justify-between"><span>Integration:</span> <span class="font-medium">Leapfrog</span></p>
        </div>

        <!-- Time Step Control (New Feature) -->
        <div class="mb-4">
            <label for="dt-slider" class="block mb-2 text-sm font-medium">Time Step (Δt): <span id="dt-value" class="font-mono text-yellow-400">0.01</span></label>
            <input type="range" id="dt-slider" min="0.001" max="0.1" step="0.001" value="0.01" class="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer">
        </div>

        <div class="flex space-x-3 mt-4">
            <button id="pause-toggle" class="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 rounded-lg shadow-md transition duration-200">
                Pause
            </button>
            <button id="reset-button" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg shadow-md transition duration-200">
                Reset System
            </button>
        </div>

        <p class="text-xs text-center text-gray-500 mt-4">Drag to rotate | Scroll to zoom</p>
    </div>

    <script>
        // --- GLOBAL SETUP ---
        const G = 6.67430e-11; // Gravitational constant
        let DT = 0.01; // Time step for integration (Δt) - Now adjustable
        const SIMULATION_SCALE = 1e8; // Scale factor for visual representation
        const TRACE_POINTS_LIMIT = 2000; // Max points for orbit trace
        const MASS_SCALE_FACTOR = 50; // Factor to visually scale non-sun bodies by mass

        let scene, camera, renderer, pointLight; // Added pointLight
        let bodies = [];
        let initialBodyStates = []; 
        let isPaused = false;
        let frameCount = 0;
        let lastTime = performance.now();
        let animationFrameId = null;

        // --- BODY CLASS (THE PARTICLE) ---
        class CelestialBody {
            constructor(mass, baseRadius, position, velocity, color) {
                this.mass = mass;
                this.baseRadius = baseRadius;
                this.color = color;
                
                // State vectors
                this.position = new THREE.Vector3().copy(position);
                this.velocity = new THREE.Vector3().copy(velocity);
                this.acceleration = new THREE.Vector3();
                this.force = new THREE.Vector3();
                
                // --- Visual Enhancement: Scale radius based on mass ---
                // We use a logarithmic scale for better visualization, otherwise planets vanish next to the sun
                const scaledRadius = (baseRadius + Math.log10(mass / 1e20)) * SIMULATION_SCALE / MASS_SCALE_FACTOR; 
                
                // Three.js Mesh
                const geometry = new THREE.SphereGeometry(scaledRadius, 32, 32);
                const material = new THREE.MeshBasicMaterial({ color: color });
                this.mesh = new THREE.Mesh(geometry, material);
                this.mesh.position.copy(this.position);
                scene.add(this.mesh);

                // Trace Line Geometry
                this.traceGeometry = new THREE.BufferGeometry();
                this.tracePositions = new Float32Array(TRACE_POINTS_LIMIT * 3); 
                this.traceGeometry.setAttribute('position', new THREE.BufferAttribute(this.tracePositions, 3));
                this.traceMaterial = new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.5 });
                this.traceLine = new THREE.Line(this.traceGeometry, this.traceMaterial);
                this.traceIndex = 0;
                scene.add(this.traceLine);
            }
            
            updateTrace() {
                const pos = this.mesh.position;
                
                // Store the current position
                this.tracePositions[this.traceIndex * 3] = pos.x;
                this.tracePositions[this.traceIndex * 3 + 1] = pos.y;
                this.tracePositions[this.traceIndex * 3 + 2] = pos.z;
                
                this.traceIndex++;
                if (this.traceIndex >= TRACE_POINTS_LIMIT) {
                    this.traceIndex = 0; // Loop buffer
                }

                // Tell Three.js to update the geometry
                this.traceGeometry.attributes.position.needsUpdate = true;
                this.traceGeometry.setDrawRange(0, TRACE_POINTS_LIMIT);
            }

            remove() {
                scene.remove(this.mesh);
                scene.remove(this.traceLine);
                this.mesh.geometry.dispose();
                this.mesh.material.dispose();
                this.traceGeometry.dispose();
                this.traceMaterial.dispose();
            }
        }

        // --- PHYSICS CALCULATION: LEAPFROG INTEGRATION ---

        function computeForces(currentBodies) {
            // Reset all forces
            currentBodies.forEach(b => b.force.set(0, 0, 0));

            // Compute pairwise forces (O(N^2) complexity)
            for (let i = 0; i < currentBodies.length; i++) {
                for (let j = i + 1; j < currentBodies.length; j++) {
                    const body1 = currentBodies[i];
                    const body2 = currentBodies[j];

                    // 1. Calculate distance vector (r_vector)
                    const r_vector = new THREE.Vector3().subVectors(body2.position, body1.position);
                    const r_sq = r_vector.lengthSq();
                    
                    // Safety check against zero distance
                    if (r_sq === 0) continue; 
                    
                    const r = Math.sqrt(r_sq);

                    // 2. Calculate force magnitude (F = G * m1 * m2 / r^2)
                    const F_magnitude = G * body1.mass * body2.mass / r_sq;

                    // 3. Calculate force vector
                    const force_vector = r_vector.clone().normalize().multiplyScalar(F_magnitude);

                    // 4. Apply forces (Newton's third law: F_12 = -F_21)
                    body1.force.add(force_vector);
                    body2.force.sub(force_vector);
                }
            }
        }

        function updatePositionsAndVelocities(currentBodies) {
            // This loop performs the Leapfrog integration step
            currentBodies.forEach(body => {
                // 1. Calculate Acceleration (a = F / m)
                body.acceleration.copy(body.force).divideScalar(body.mass);

                // 2. Update Velocity (v(t+Δt/2) = v(t-Δt/2) + a(t) * Δt)
                body.velocity.add(body.acceleration.clone().multiplyScalar(DT));
                
                // 3. Update Position (x(t+Δt) = x(t) + v(t+Δt/2) * Δt)
                body.position.add(body.velocity.clone().multiplyScalar(DT));
                
                // 4. Update Mesh position for rendering and trace
                body.mesh.position.copy(body.position);
                body.updateTrace(); // Store the new position for the trace line
            });
        }

        // --- INITIALIZATION & CONTROLS ---

        function init() {
            // Scene
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x0a0a0a);

            // Camera (Perspective)
            camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 100000 * SIMULATION_SCALE);
            camera.position.z = 25000 * SIMULATION_SCALE;

            // Renderer
            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            document.body.appendChild(renderer.domElement);
            
            // --- Lighting (New Feature) ---
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.1); // Soft ambient light
            scene.add(ambientLight);

            // Point Light (Simulate light coming from the Sun)
            pointLight = new THREE.PointLight(0xffffff, 2, 0, 0); // High intensity point light
            pointLight.position.set(0, 0, 0); // Position at the center (where the Sun is)
            scene.add(pointLight);

            // Starfield Background (New Feature)
            createStarfield();

            setupMockControls();
            
            // Create Initial Bodies
            createSolarSystemMock();

            window.addEventListener('resize', onWindowResize, false);
            
            // Setup DT slider listener
            document.getElementById('dt-slider').addEventListener('input', updateTimeStep);
            
            // Start the animation loop
            animate();
        }
        
        function createStarfield(starCount = 10000) {
            const geometry = new THREE.BufferGeometry();
            const positions = [];
            const colors = [];

            const color = new THREE.Color();
            const minRange = -50000 * SIMULATION_SCALE;
            const maxRange = 50000 * SIMULATION_SCALE;

            for (let i = 0; i < starCount; i++) {
                // Random position within the simulated space
                positions.push(
                    minRange + Math.random() * (maxRange - minRange),
                    minRange + Math.random() * (maxRange - minRange),
                    minRange + Math.random() * (maxRange - minRange)
                );
                
                // Random color and intensity
                color.setHSL(Math.random(), 1.0, Math.random() * 0.5 + 0.5);
                colors.push(color.r, color.g, color.b);
            }

            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

            const material = new THREE.PointsMaterial({ size: 1000 * SIMULATION_SCALE, vertexColors: true, transparent: true, opacity: 0.8 });
            const stars = new THREE.Points(geometry, material);
            scene.add(stars);
        }

        function updateTimeStep(event) {
            DT = parseFloat(event.target.value);
            document.getElementById('dt-value').textContent = DT.toFixed(3);
        }

        function setupMockControls() {
            // Basic rotation implementation using mouse drag
            let isDragging = false;
            let previousMousePosition = { x: 0, y: 0 };
            
            document.addEventListener('mousedown', (e) => {
                // Only start drag if not clicking a button
                if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') {
                    isDragging = true;
                    previousMousePosition.x = e.clientX;
                    previousMousePosition.y = e.clientY;
                }
            });

            document.addEventListener('mouseup', () => {
                isDragging = false;
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                
                const deltaX = e.clientX - previousMousePosition.x;
                const deltaY = e.clientY - previousMousePosition.y;

                // Adjust rotation sensitivity
                const sensitivity = 0.005; 
                
                // Apply rotation to the scene's quaternion
                const rotationX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), deltaX * sensitivity);
                const rotationY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), deltaY * sensitivity);

                scene.quaternion.multiplyQuaternions(rotationX, scene.quaternion);
                scene.quaternion.multiplyQuaternions(rotationY, scene.quaternion);

                previousMousePosition.x = e.clientX;
                previousMousePosition.y = e.clientY;
            });
            
            // Basic zoom implementation using mouse wheel
            document.addEventListener('wheel', (e) => {
                e.preventDefault(); // Prevent page scroll
                const zoomFactor = 1 + (e.deltaY * 0.0005);
                camera.position.multiplyScalar(zoomFactor);
            });
            
            // Event Listeners for buttons
            document.getElementById('pause-toggle').addEventListener('click', togglePause);
            document.getElementById('reset-button').addEventListener('click', resetSimulation);
        }

        function createSolarSystemMock() {
            // Clear existing bodies and cleanup Three.js resources
            bodies.forEach(b => b.remove());
            bodies = [];
            initialBodyStates = [];

            // Define positions and velocities based on simplified orbital mechanics
            const sunMass = 1.989e30;
            const earthMass = 5.972e24;
            const jupiterMass = 1.898e27;
            const centralPosition = new THREE.Vector3(0, 0, 0);

            // SUN (Index 0) - Base radius 100, mass is very high
            const sun = new CelestialBody(sunMass, 1000, centralPosition, new THREE.Vector3(), 0xfff700);
            bodies.push(sun);

            // EARTH (Index 1)
            const earthOrbitRadius = 1.496e11;
            const earthOrbitalSpeed = Math.sqrt(G * sunMass / earthOrbitRadius); // Calculated Keplerian velocity
            const earth = new CelestialBody(
                earthMass, 10, 
                new THREE.Vector3(earthOrbitRadius * SIMULATION_SCALE, 0, 0), 
                new THREE.Vector3(0, 0, -earthOrbitalSpeed * SIMULATION_SCALE), // Velocity vector
                0x3366ff
            );
            bodies.push(earth);
            
            // JUPITER (Index 2)
            const jupiterOrbitRadius = 7.785e11;
            const jupiterOrbitalSpeed = Math.sqrt(G * sunMass / jupiterOrbitRadius);
            const jupiter = new CelestialBody(
                jupiterMass, 30, 
                new THREE.Vector3(0, jupiterOrbitRadius * SIMULATION_SCALE, 0), 
                new THREE.Vector3(jupiterOrbitalSpeed * SIMULATION_SCALE, 0, 0), 
                0xff9900
            );
            bodies.push(jupiter);
            
            // Small Body for fun
             const asteroidOrbitRadius = 3.5e11;
             const asteroidOrbitalSpeed = Math.sqrt(G * sunMass / asteroidOrbitRadius) * 1.5; // Highly eccentric speed
             const asteroid = new CelestialBody(
                 5e20, 5, 
                 new THREE.Vector3(-asteroidOrbitRadius * SIMULATION_SCALE, 0, 0), 
                 new THREE.Vector3(0, 0, asteroidOrbitalSpeed * SIMULATION_SCALE), 
                 0xcccccc
             );
             bodies.push(asteroid);

            // Store initial states immediately after creation
            initialBodyStates = bodies.map(b => ({
                mass: b.mass,
                baseRadius: b.baseRadius,
                position: b.position.clone(),
                velocity: b.velocity.clone(),
                color: b.color
            }));
            
            document.getElementById('body-count').textContent = bodies.length;
        }
        
        function togglePause() {
            isPaused = !isPaused;
            document.getElementById('pause-toggle').textContent = isPaused ? 'Resume' : 'Pause';
        }

        function resetSimulation() {
            // Pause the simulation first
            isPaused = true;
            document.getElementById('pause-toggle').textContent = 'Resume';
            
            // Clear all existing Three.js objects
            bodies.forEach(b => b.remove());
            bodies = [];

            // Recreate bodies from initial states
            initialBodyStates.forEach(state => {
                const newBody = new CelestialBody(
                    state.mass, 
                    state.baseRadius, 
                    state.position, 
                    state.velocity, 
                    state.color
                );
                bodies.push(newBody);
            });
            
            // Reset camera and scene rotation (optional)
            camera.position.z = 25000 * SIMULATION_SCALE;
            scene.quaternion.set(0, 0, 0, 1);
            
            console.log("Simulation reset to initial state.");
        }


        // --- ANIMATION LOOP ---

        function animate() {
            animationFrameId = requestAnimationFrame(animate);

            if (!isPaused) {
                // 1. Physics Step
                computeForces(bodies);
                updatePositionsAndVelocities(bodies);
            }

            // 2. Rendering Step
            renderer.render(scene, camera);
            
            // 3. FPS Calculation
            updateFPS();
        }
        
        function updateFPS() {
            frameCount++;
            const currentTime = performance.now();
            const elapsed = currentTime - lastTime;

            if (elapsed >= 1000) { // Update every second
                const fps = (frameCount / (elapsed / 1000)).toFixed(1);
                document.getElementById('fps-display').textContent = fps;
                frameCount = 0;
                lastTime = currentTime;
            }
        }

        function onWindowResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }

        // Start the simulation when the window loads
        window.onload = function() {
            init();
        };

    </script>
</body>
</html>
