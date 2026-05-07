import os
import subprocess
from PIL import Image

def create_mac_icon(input_path, output_name="icon"):
    if not os.path.exists(input_path):
        print(f"Error: {input_path} not found.")
        return

    # Folder required by iconutil
    iconset_dir = f"{output_name}.iconset"
    if not os.path.exists(iconset_dir):
        os.makedirs(iconset_dir)

    try:
        img = Image.open(input_path).convert("RGBA")
        width, height = img.size
        # Create a square canvas
        max_dim = max(width, height)
        square_img = Image.new('RGBA', (max_dim, max_dim), (0, 0, 0, 0))
        
        # Center the image
        x = (max_dim - width) // 2
        y = (max_dim - height) // 2
        square_img.paste(img, (x, y))

        # Standard macOS icon sizes
        # 16, 32, 128, 256, 512
        sizes = [16, 32, 128, 256, 512]
        
        print("Generating resized PNGs...")
        for size in sizes:
            # Normal resolution (e.g. icon_32x32.png)
            resized = square_img.resize((size, size), Image.Resampling.LANCZOS)
            resized.save(os.path.join(iconset_dir, f"icon_{size}x{size}.png"))
            
            # Retina resolution (e.g. icon_32x32@2x.png)
            size_2x = size * 2
            resized_2x = square_img.resize((size_2x, size_2x), Image.Resampling.LANCZOS)
            resized_2x.save(os.path.join(iconset_dir, f"icon_{size}x{size}@2x.png"))

        print(f"Iconset created at ./{iconset_dir}")
        print("Running 'iconutil' to package as .icns...")
        
        # Run system command iconutil (macOS only)
        subprocess.run(["iconutil", "-c", "icns", iconset_dir], check=True)
        print(f"Success! {output_name}.icns created.")
        
        # Optional: Clean up
        # import shutil
        # shutil.rmtree(iconset_dir)
        
    except FileNotFoundError:
        print("Error: 'iconutil' command not found. Please run this script on macOS.")
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    create_mac_icon("icon.png")
