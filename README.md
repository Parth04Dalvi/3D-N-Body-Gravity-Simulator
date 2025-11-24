# 3D-N-Body-Gravity-Simulator
This project showcases mathematical modeling, 3D graphics, and computational physics, making it a powerful portfolio piece for a computer science graduate.
Real-Time 3D N-Body Gravity Simulator (Three.js) 🪐

<img width="562" height="480" alt="image" src="https://github.com/user-attachments/assets/8260e56c-26f5-44b1-826e-3f4fe4bc5041" />

Overview and Project Goal

This project is a high-performance, real-time 3D simulation of the N-Body Problem—a classical problem in physics and computational science. It demonstrates the gravitational interaction of multiple masses (planets, stars) in a 3D space, showcasing advanced expertise in:

Computational Physics: Implementing and controlling a numerical integration method for complex systems.

Algorithm Design: Managing the O(N²) complexity of force calculation.

3D Graphics & WebGL: Using Three.js to visualize the simulation data in a dynamic, interactive environment.

⚛️ Numerical Method: Leapfrog Integration

The simulation's accuracy and stability rely on a robust numerical solver. This project uses the Leapfrog Integration method:

Leapfrog (or Verlet Integration): An explicit, second-order symplectic integrator commonly used in molecular dynamics and astronomical simulations.

Advantage: It offers superior stability and better conservation of energy over long time periods compared to simpler methods (like Euler integration), which is essential for accurate orbital mechanics.

🌟 Enhanced Features & Interactivity

Feature

Physics Concept Demonstrated

Adjustable Time Step (Δt)

Allows the user to dynamically adjust the time step. Observing the system's behavior at large $\Delta t$ directly illustrates Numerical Instability and error propagation in computational physics.

Orbital Trace Lines

Visualizes the actual trajectory of each body through time, confirming the elliptical/complex path resulting from the numerical integration.

Pause/Resume & Reset

Provides essential control for detailed analysis of system behavior at specific points in time.

Mass-Scaled Visualization

Body size is logarithmically scaled based on mass, enhancing the visual realism of the system's physics.

Immersive Starfield

Adds a realistic, dynamic background using Three.js points geometry.

💻 Technology Stack

Core Logic: Custom JavaScript implementation of the Leapfrog Integration algorithm.

Concepts: Computational Physics, Numerical Methods, Vector Mathematics, Optimization.

Execution

The project is contained within a single n_body_simulator.html file.

Open the file: Simply open n_body_simulator.html in any modern web browser.

Interact:

Physics Control: Use the Time Step (Δt) slider in the control panel to manipulate the integration speed and accuracy.

Navigation: Drag the mouse to rotate the view and use the scroll wheel to zoom in and out.
