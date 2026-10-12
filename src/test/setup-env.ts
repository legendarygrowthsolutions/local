// Vite sets process.env.DEV="1" for its own purposes, which collides with the app's DEV=1 switch
// (dummy SMS + simulated payments). Tests opt into that switch explicitly instead.
delete process.env.DEV;
