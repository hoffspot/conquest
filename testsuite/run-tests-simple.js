#!/usr/bin/env node

/**
 * Simple Test Runner for Last Colony
 * ==================================
 * Runs tests and captures console output for analysis.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

class SimpleTestRunner {
    constructor() {
        this.server = null;
        this.port = 8000;
    }
    
    async startServer() {
        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                if (req.url === '/testsuite/runalltests-cli.html') {
                    const filePath = path.join(__dirname, 'runalltests-cli.html');
                    fs.readFile(filePath, (err, data) => {
                        if (err) {
                            res.writeHead(500);
                            res.end('Error loading test file');
                        } else {
                            res.writeHead(200, { 'Content-Type': 'text/html' });
                            res.end(data);
                        }
                    });
                } else if (req.url.startsWith('/js/')) {
                    const filePath = path.join(__dirname, '..', req.url);
                    fs.readFile(filePath, (err, data) => {
                        if (err) {
                            res.writeHead(404);
                            res.end('File not found');
                        } else {
                            const ext = path.extname(filePath);
                            const contentType = {
                                '.js': 'application/javascript',
                                '.css': 'text/css',
                                '.html': 'text/html'
                            }[ext] || 'text/plain';
                            
                            res.writeHead(200, { 'Content-Type': contentType });
                            res.end(data);
                        }
                    });
                } else if (req.url.startsWith('/testsuite/tests/')) {
                    const filePath = path.join(__dirname, req.url);
                    fs.readFile(filePath, (err, data) => {
                        if (err) {
                            res.writeHead(404);
                            res.end('File not found');
                        } else {
                            res.writeHead(200, { 'Content-Type': 'application/javascript' });
                            res.end(data);
                        }
                    });
                } else {
                    res.writeHead(404);
                    res.end('Not found');
                }
            });
            
            this.server.listen(this.port, () => {
                console.log(`🚀 Test server started on port ${this.port}`);
                resolve();
            });
            
            this.server.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    console.log(`⚠️  Port ${this.port} in use, trying ${this.port + 1}`);
                    this.port++;
                    this.server.listen(this.port);
                } else {
                    reject(err);
                }
            });
        });
    }
    
    async runTests() {
        console.log('🧪 Running Last Colony Test Suite...');
        
        return new Promise((resolve, reject) => {
            const url = `http://localhost:${this.port}/testsuite/runalltests-cli.html?mode=cli`;
            
            // Use curl to fetch the test page and capture output
            const { exec } = require('child_process');
            const curl = exec(`curl -s "${url}"`, { timeout: 30000 }, (error, stdout, stderr) => {
                if (error) {
                    console.error('❌ Error running tests:', error.message);
                    reject(error);
                    return;
                }
                
                // Parse the output to extract test results
                const lines = stdout.split('\n');
                let passed = 0;
                let failed = 0;
                
                lines.forEach(line => {
                    if (line.includes('✅ PASS')) {
                        passed++;
                        console.log(line);
                    } else if (line.includes('❌ FAIL') || line.includes('💥 ERROR')) {
                        failed++;
                        console.log(line);
                    } else if (line.includes('Testing:') || line.includes('All tests completed')) {
                        console.log(line);
                    }
                });
                
                console.log(`\n📊 Summary: ${passed} passed, ${failed} failed`);
                
                if (failed > 0) {
                    console.log('❌ Some tests failed');
                    resolve({ success: false, passed, failed });
                } else {
                    console.log('✅ All tests passed!');
                    resolve({ success: true, passed, failed });
                }
            });
            
            curl.on('error', (error) => {
                console.error('❌ Curl error:', error.message);
                reject(error);
            });
        });
    }
    
    stopServer() {
        if (this.server) {
            this.server.close();
            console.log('🛑 Test server stopped');
        }
    }
}

async function main() {
    const runner = new SimpleTestRunner();
    
    try {
        await runner.startServer();
        const result = await runner.runTests();
        runner.stopServer();
        
        if (!result.success) {
            process.exit(1);
        }
    } catch (error) {
        console.error('💥 Test runner failed:', error.message);
        runner.stopServer();
        process.exit(1);
    }
}

// Check if we're in the right directory
if (!fs.existsSync(path.join(__dirname, 'runalltests-cli.html'))) {
    console.error('❌ Test files not found. Please run from the testsuite directory.');
    process.exit(1);
}

main(); 