from PIL import Image
import os

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
        
        # Save as ICO. Including multiple sizes for better OS scaling support.
        # Note: 256x256 is standard for Windows Vista+ large icons.
        sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
        
        # We need to resize the image for each size properly to ensure quality
        # actually PIL's ICO saver can handle resizing if we just provide one huge image, 
        # but providing explicitly resized versions in the list is sometimes safer. 
        # However, passing the single large image to .save with sizes=... argument 
        # usually makes PIL auto-resize. Let's try the simplest robust way.
        
        new_img.save(output_path, format='ICO', sizes=sizes)
        print(f"Successfully created {output_path} from {input_path}")
        
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    convert_to_ico("icon.png", "icon.ico")