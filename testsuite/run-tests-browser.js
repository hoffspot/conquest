#!/usr/bin/env node

/**
 * Browser-based Test Runner for Last Colony
 * =========================================
 * Runs tests in a browser environment and captures results.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

class BrowserTestRunner {
    constructor() {
        this.server = null;
        this.port = 8000;
        this.testResults = [];
        this.passed = 0;
        this.failed = 0;
    }
    
    async startServer() {
        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                if (req.url === '/testsuite/simple-test-runner.html') {
                    const filePath = path.join(__dirname, 'simple-test-runner.html');
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
            const url = `http://localhost:${this.port}/testsuite/simple-test-runner.html`;
            
            // Use curl to fetch the test page
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
                
                this.passed = passed;
                this.failed = failed;
                
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
    
    printSummary() {
        console.log('\n' + '='.repeat(50));
        console.log('📊 FINAL TEST SUMMARY');
        console.log('='.repeat(50));
        console.log(`Total Tests: ${this.passed + this.failed}`);
        console.log(`Passed: ${this.passed}`);
        console.log(`Failed: ${this.failed}`);
        console.log('='.repeat(50));
        
        if (this.failed === 0) {
            console.log('\n🎉 ALL TESTS PASSED!');
        } else {
            console.log(`\n⚠️  ${this.failed} tests failed`);
        }
    }
}

async function main() {
    const runner = new BrowserTestRunner();
    
    try {
        await runner.startServer();
        const result = await runner.runTests();
        runner.printSummary();
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
if (!fs.existsSync(path.join(__dirname, 'simple-test-runner.html'))) {
    console.error('❌ Test files not found. Please run from the testsuite directory.');
    process.exit(1);
}

main(); 