const http = require('http');
const fs = require('fs');
const path = require('path');

// Define the directory to serve files from
const publicDirectory = path.join(__dirname, 'public');

// Create the HTTP server
const server = http.createServer((req, res) => {
    // Build the file path
    let filePath = path.join(publicDirectory, req.url === '/' ? 'index.html' : req.url);

    // Get the file extension
    const extname = path.extname(filePath);

    // Default to text/html content type
    let contentType = 'text/html';

    // Set the appropriate content type based on the file extension
    switch (extname) {
        case '.js':
            contentType = 'text/javascript';
            break;
        case '.css':
            contentType = 'text/css';
            break;
        case '.json':
            contentType = 'application/json';
            break;
        case '.png':
            contentType = 'image/png';
            break;
        case '.jpg':
            contentType = 'image/jpg';
            break;
        case '.gif':
            contentType = 'image/gif';
            break;
        case '.svg':
            contentType = 'image/svg+xml';
            break;
        case '.wav':
            contentType = 'audio/wav';
            break;
        case '.mp4':
            contentType = 'video/mp4';
            break;
        case '.woff':
            contentType = 'application/font-woff';
            break;
        case '.ttf':
            contentType = 'application/font-ttf';
            break;
        case '.eot':
            contentType = 'application/vnd.ms-fontobject';
            break;
        case '.otf':
            contentType = 'application/font-otf';
            break;
        case '.wasm':
            contentType = 'application/wasm';
            break;
    }

    // Read the file from the file system
    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                // If file not found, serve a 404 error page
                fs.readFile(path.join(publicDirectory, '404.html'), (err, content404) => {
                    res.writeHead(404, { 'Content-Type': 'text/html' });
                    res.end(content404, 'utf-8');
                });
            } else {
                // Some server error
                res.writeHead(500);
                res.end(`Server Error: ${error.code}`);
            }
        } else {
            // Successful response
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// Define the port to listen on
const PORT = process.env.PORT || 7070;

// Start the server
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});
