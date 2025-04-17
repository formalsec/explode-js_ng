import os
import shutil

# Define the list of directory names you want to keep
whitelist = {'GHSA-28mc-g557-92m7', 
             'GHSA-2g4c-8fpm-c46v', 
             'GHSA-34q8-jcq6-mc37',
             'GHSA-3hvj-2783-34x2',
             'GHSA-3q56-9cc2-46j4',
             'GHSA-69r2-2fg7-7hf9',
             'GHSA-79h2-v6hh-wq23',
             'GHSA-7qgg-vw88-cc99',
             'GHSA-82jv-9wjw-pqh6',
             'GHSA-f6v4-cf5j-vf3w'
             }

# Get the current working directory
base_dir = os.getcwd()

# Iterate through items in the current directory
for item in os.listdir(base_dir):
    item_path = os.path.join(base_dir, item)

    # Check if it's a directory and not in the whitelist
    if os.path.isdir(item_path) and item not in whitelist:
        print(f"Deleting: {item_path}")
        shutil.rmtree(item_path)

print("Cleanup complete.")

