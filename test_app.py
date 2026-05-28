#!/usr/bin/env python3
from playwright.sync_api import sync_playwright
import time
import os

def test_reading_app():
    screenshots_dir = '/workspace/children-reading-app/screenshots'
    os.makedirs(screenshots_dir, exist_ok=True)
    
    with sync_playwright() as p:
        # Launch browser
        browser = p.chromium.launch(headless=False)  # headless=False to see the browser
        context = browser.new_context(
            viewport={'width': 390, 'height': 844},  # iPhone 14 Pro size
            device_scale_factor=2,
            is_mobile=True,
            has_touch=True
        )
        page = context.new_page()
        
        # Navigate to app
        print("1. 打开App...")
        page.goto('http://localhost:8080')
        page.wait_for_load_state('networkidle')
        time.sleep(1)
        
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
        
        # Wait for auto-play
        page.wait_for_timeout(1500)
        
        # Screenshot 7: Playing state
        print("7. 截图：播放中")
        page.screenshot(path=f'{screenshots_dir}/05_playing.png', full_page=False)
        
        # Wait for page to complete
        print("8. 等待页面讲解完毕...")
        page.wait_for_timeout(30000)
        
        # Check for turn page prompt
        print("9. 截图：翻页提示")
        page.screenshot(path=f'{screenshots_dir}/06_turn_page_prompt.png', full_page=False)
        
        # Test page turn (click the button)
        print("10. 模拟翻页...")
        page.click('#pageTurnBtn')
        page.wait_for_timeout(1000)
        
        # Screenshot 8: Next page
        print("11. 截图：下一页")
        page.screenshot(path=f'{screenshots_dir}/07_next_page.png', full_page=False)
        
        # Close reading
        print("12. 关闭阅读，返回扫描界面")
        page.click('#closeReadingBtn')
        page.wait_for_timeout(1000)
        
        # Screenshot 9: Back to scan
        print("13. 截图：返回扫描界面")
        page.screenshot(path=f'{screenshots_dir}/08_back_to_scan.png', full_page=False)
        
        browser.close()
        
        print(f"\n✅ 所有截图已保存到: {screenshots_dir}")
        print("\n截图文件列表:")
        for i in range(1, 14):
            try:
                filename = f'{screenshots_dir}/0{i if i < 10 else i}_*.png'
                import glob
                files = glob.glob(filename)
                if files:
                    print(f"  - {files[0]}")
            except:
                pass

if __name__ == '__main__':
    test_reading_app()
