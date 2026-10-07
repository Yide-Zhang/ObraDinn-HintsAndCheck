from PIL import Image
import os

# Windows 图标的标准档位（256 是 Vista+ 的「超大图标」，任务栏/资源管理器都会用）
SIZES = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]


def convert_to_ico(input_path, output_path):
    if not os.path.exists(input_path):
        print(f"Error: {input_path} not found.")
        return

    try:
        img = Image.open(input_path)
        img = img.convert("RGBA")
        
        width, height = img.size
        max_dim = max(width, height)
        
        # Create new square image with transparent background
        new_img = Image.new('RGBA', (max_dim, max_dim), (0, 0, 0, 0))
        
        # Calculate position to center
        x = (max_dim - width) // 2
        y = (max_dim - height) // 2
        
        new_img.paste(img, (x, y))
        
        # 统一以 256 为基准：PIL 保存 ICO 时会跳过「比源图大」的档位，
        # 源图若小于 256 就会丢掉 256 那档，因此这里先归一化到 256。
        if new_img.size != (256, 256):
            new_img = new_img.resize((256, 256), Image.LANCZOS)

        new_img.save(output_path, format='ICO', sizes=SIZES)
        print(f"Successfully created {output_path} from {input_path}")
        
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    convert_to_ico("icon.png", "icon.ico")