#!/usr/bin/env python3

"""
Python Test Runner for Last Colony
==================================
Runs tests using Python and captures results.
"""

import http.server
import socketserver
import urllib.request
import urllib.parse
import urllib.error
import threading
import time
import re
import sys
import os
from pathlib import Path

class TestRunner:
    def __init__(self):
        self.port = 8000
        self.server = None
        self.server_thread = None
        self.passed = 0
        self.failed = 0
        self.server_running = False
        
    def start_server(self):
        """Start HTTP server in a separate thread"""
        class TestHandler(http.server.SimpleHTTPRequestHandler):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=Path(__file__).parent.parent, **kwargs)
            def log_message(self, format, *args):
                # Suppress server logs
                pass
        
        try:
            self.server = socketserver.TCPServer(("", self.port), TestHandler, bind_and_activate=False)
            self.server.allow_reuse_address = True
            self.server.server_bind()
            self.server.server_activate()
            self.server_thread = threading.Thread(target=self.server.serve_forever)
            self.server_thread.daemon = True
            self.server_thread.start()
            self.server_running = True
            print(f"🚀 Test server started on port {self.port}")
            time.sleep(1)  # Give server time to start
        except OSError as e:
            if e.errno == 48:  # Address already in use
                self.port += 1
                self.start_server()
            else:
                raise
    
    def stop_server(self):
        """Stop the HTTP server and release the socket"""
        if self.server:
            try:
                self.server.shutdown()
                self.server.server_close()
                print("🛑 Test server stopped")
            except Exception as e:
                print(f"⚠️  Error stopping server: {e}")
            self.server = None
            self.server_running = False
    
    def fetch_test_results(self):
        """Fetch test results from the browser"""
        url = f"http://localhost:{self.port}/testsuite/test-minimal.html"
        try:
            with urllib.request.urlopen(url, timeout=30) as response:
                html = response.read().decode('utf-8')
                return self.parse_test_results(html)
        except Exception as e:
            print(f"❌ Error fetching test results: {e}")
            return False
    
    def parse_test_results(self, html):
        """Parse test results from HTML"""
        print("🧪 Running Last Colony Test Suite...")
        results_match = re.search(r'<div id="results">(.*?)</div>', html, re.DOTALL)
        if not results_match:
            print("❌ Could not find test results in HTML")
            return False
        results_html = results_match.group(1)
        lines = results_html.split('<div>')
        passed = 0
        failed = 0
        for line in lines:
            line = line.strip()
            if not line:
                continue
            if '✅ PASS:' in line:
                passed += 1
                print(line)
            elif '❌ FAIL:' in line or '💥 ERROR:' in line:
                failed += 1
                print(line)
            elif 'Testing:' in line or 'All tests completed' in line:
                print(line)
        self.passed = passed
        self.failed = failed
        print(f"\n📊 Summary: {passed} passed, {failed} failed")
        if failed > 0:
            print("❌ Some tests failed")
            return False
        else:
            print("✅ All tests passed!")
            return True
    
    def print_summary(self):
        print("\n" + "=" * 50)
        print("📊 FINAL TEST SUMMARY")
        print("=" * 50)
        print(f"Total Tests: {self.passed + self.failed}")
        print(f"Passed: {self.passed}")
        print(f"Failed: {self.failed}")
        print("=" * 50)
        if self.failed == 0:
            print("\n🎉 ALL TESTS PASSED!")
        else:
            print(f"\n⚠️  {self.failed} tests failed")
    
    def run(self):
        try:
            self.start_server()
            success = self.fetch_test_results()
            self.print_summary()
            return success
        except Exception as e:
            print(f"💥 Test runner failed: {e}")
            return False
        finally:
            self.stop_server()
            # Wait a moment to ensure socket is released
            time.sleep(0.5)

def main():
    if not os.path.exists('test-minimal.html'):
        print("❌ Test files not found. Please run from the testsuite directory.")
        sys.exit(1)
    runner = TestRunner()
    success = runner.run()
    if not success:
        sys.exit(1)

if __name__ == "__main__":
    main() 