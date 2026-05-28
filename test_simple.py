#!/usr/bin/env python3
from playwright.sync_api import sync_playwright
import time
import os

def test_reading_app():
    screenshots_dir = '/workspace/children-reading-app/screenshots'
    os.makedirs(screenshots_dir, exist_ok=True)
    
    with sync_playwright() as p:
        # Launch browser
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            viewport={'width': 390, 'height': 844},
            device_scale_factor=2,
            is_mobile=True,
            has_touch=True
        )
        page = context.new_page()
        
        # Navigate to app
        print("1. 打开App...")
        page.goto('http://localhost:8080')
        page.wait_for_load_state('networkidle')
        time.sleep(2)
        
        # Screenshot 1: Initial scan interface
        print("2. 截图：初始扫描界面")
        page.screenshot(path=f'{screenshots_dir}/01_initial_scan.png', full_page=False)
        
        # Wait for auto-detection (3 seconds)
        print("3. 等待自动识别...")
        page.wait_for_timeout(3500)
        
        # Check if detecting overlay is visible
        print("4. 截图：识别中...")
        page.screenshot(path=f'{screenshots_dir}/02_detecting.png', full_page=False)
        
        # Wait for detection to complete
        page.wait_for_timeout(2500)
        
        # Check if success overlay is visible
        print("5. 截图：识别成功")
        page.screenshot(path=f'{screenshots_dir}/03_success.png', full_page=False)
        
        # Wait for reading to start
        page.wait_for_timeout(2500)
        
        # Screenshot 6: Reading interface
        print("6. 截图：阅读界面")
        page.screenshot(path=f'{screenshots_dir}/04_reading.png', full_page=False)
        
        browser.close()
        
        print(f"\n✅ 截图已保存到: {screenshots_dir}")

if __name__ == '__main__':
    test_reading_app()
