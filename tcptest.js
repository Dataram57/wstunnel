const net = require('net');

// Create a TCP server
const server = net.createServer(socket => {
    console.log('Client connected');

    // When data is received from a client
    socket.on('data', data => {
        console.log('Received:', data.toString());

        // Echo back the received data
        socket.write('Echo: ' + data.toString());
    });

    // When a client disconnects
    socket.on('end', () => {
        console.log('Client disconnected');
    });
});

// Start the server and listen on a specific port
const PORT = 3000;
server.listen(PORT, () => {
    console.log('Server listening on port', PORT);
});
