import os
import re
import json
import glob
import tarfile
import requests
import tempfile

def load_json(fpath):
    try:
        with open(fpath, 'r', encoding='utf-8') as fd:
            return json.load(fd)
    except (json.JSONDecodeError, FileNotFoundError, Exception) as e:
        print(f"Error loading JSON from {fpath}: {e}")
        return None

def count_tokens_basic(code_string):
    tokens = re.split(r'[^a-zA-Z0-9_\s.,;:\(\)\[\]{}\<\>\=!+\-*/&|^%~]+', code_string)
    tokens = [token for token in tokens if token.strip()]
    return len(tokens)

def count_tokens_from_link(package_link):
    with tempfile.TemporaryDirectory() as tmpdir:
        print(f"  Using temporary directory: {tmpdir}")

        tarball_path = os.path.join(tmpdir, "package.tgz")
        try:
            print(f"Downloading package...")
            response = requests.get(package_link, stream=True)
            response.raise_for_status()
            with open(tarball_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            print("Download complete.")
        except requests.exceptions.RequestException as e:
            print(f"Error downloading {package_link}: {e}")
            return 0

        extract_dir = os.path.join(tmpdir, "extracted")
        os.makedirs(extract_dir, exist_ok=True)
        try:
            print(f"Extracting package...")
            with tarfile.open(tarball_path, 'r:gz') as tar:
                # Ensure members are extracted within the extraction directory
                def is_within_directory(directory, path):
                    abs_directory = os.path.abspath(directory)
                    abs_path = os.path.abspath(path)
                    return abs_directory == os.path.commonpath([abs_directory, abs_path])

                for member in tar.getmembers():
                    member_path = os.path.join(extract_dir, member.name)
                    if not is_within_directory(extract_dir, member_path):
                         raise Exception("Attempted Path Traversal in Tar File")
                    if member.issym() or member.islnk():
                        print(f"    Skipping symlink/hardlink: {member.name}")
                        continue
                    try:
                        tar.extract(member, path=extract_dir, set_attrs=False) # set_attrs=False to avoid permission issues
                    except Exception as e:
                         print(f"    Error extracting member {member.name}: {e}")


            print("  Extraction complete.")

        except tarfile.TarError as e:
            print(f"  Error extracting {tarball_path}: {e}")
            return 0
        except Exception as e:
            print(f"  Security Error during extraction: {e}")
            return 0


        total_tokens = 0
        number_of_files = 0

        print("  Counting tokens in JS/TS files...")
        for root, _, files in os.walk(extract_dir):
            for file in files:
                fpath = os.path.join(root, file)
                try:
                    with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
                        number_of_files += 1
                        code = f.read()
                        tokens = count_tokens_basic(code)
                        total_tokens += tokens
                        # print(f"    {fpath}: {tokens} tokens") # Uncomment for detailed file counts
                except Exception as e:
                    print(f"    Error reading or processing {fpath}: {e}")

        print(f"  Total tokens in JS/TS files for this package: {total_tokens}")
        print("-" * 20)
        return total_tokens, number_of_files

def print_token_cost_comparison(input_token_count: int, output_token_count: int):
    # GPT-4o Costs
    gpt_4o_input_cost_per_token = 2.5 / 1000000
    gpt_4o_output_cost_per_token = 10 / 1000000

    # Gemini Costs
    gemini_input_cost_per_token = 0.1 / 1000000
    gemini_output_cost_per_token = 0.4 / 1000000

    gemini_input_total_cost = input_token_count * gemini_input_cost_per_token
    gemini_output_total_cost = output_token_count * gemini_output_cost_per_token
    gemini_total_cost = gemini_input_total_cost + gemini_output_total_cost

    gpt_4o_input_total_cost = input_token_count * gpt_4o_input_cost_per_token
    gpt_4o_output_total_cost = output_token_count * gpt_4o_output_cost_per_token
    gpt_4o_total_cost = gpt_4o_input_total_cost + gpt_4o_output_total_cost

    print("\n--- Token Cost Comparison ---")
    print(f"Input Tokens: {input_token_count}")
    print(f"Output Tokens: {output_token_count}")
    print("-" * 55) # Adjust width as needed

    col1_width = 12
    col2_width = 20
    col3_width = 20
    total_table_width = col1_width + col2_width + col3_width + 6

    print(f"| {'Token Type':<{col1_width}} | {'Gemini Cost (USD)':<{col2_width}} | {'GPT-4o Cost (USD)':<{col3_width}} |")
    print(f"|{'-' * (col1_width +1)}-|{'-' * (col2_width + 2)}-|{'-' * col3_width}-|")
    print(f"| {'Input':<{col1_width}} | {gemini_input_total_cost:<{col2_width}.8f} | {gpt_4o_input_total_cost:<{col3_width}.8f} |")
    print(f"| {'Output':<{col1_width}} | {gemini_output_total_cost:<{col2_width}.8f} | {gpt_4o_output_total_cost:<{col3_width}.8f} |")
    print(f"|{'-' * (col1_width +1)}-|{'-' * (col2_width + 2)}-|{'-' * col3_width}-|")
    print(f"| {'Total':<{col1_width}} | {gemini_total_cost:<{col2_width}.8f} | {gpt_4o_total_cost:<{col3_width}.8f} |")
    print("+" + "-" * total_table_width + "+")

def main():
    package_json = os.path.join('.', '**', 'package.json')
    packages = glob.glob(package_json, recursive=True)

    token_counts = {}

    for package in packages:
        package_data = load_json(package)

        if not package_data or "advisory" not in package_data:
            print("  Skipping: No advisory data or failed to load JSON.")
            continue

        package_name = package_data["package"]
        package_version = package_data["version"]
        package_name = f'{package_name}@{package_version}'
        package_link = package_data["correct_package_link"]

        print("Package link: ", package_link)
        token_count = count_tokens_from_link(package_link)
        token_counts[package_name] = token_count

    total_tokens, number_of_files = 0, 0
    for _, (tokens, files) in token_counts.items():
        total_tokens += tokens
        number_of_files += files

    print(number_of_files)
    ratio_1_to_1_input = total_tokens
    ratio_1_to_1_output = total_tokens
    print("\n--- Scenario: Input/Output Ratio 1:1 ---")
    print_token_cost_comparison(ratio_1_to_1_input, ratio_1_to_1_output)

    ratio_2_to_1_input = total_tokens
    ratio_2_to_1_output = total_tokens // 2
    print("\n--- Scenario: Input/Output Ratio 2:1 ---")
    print_token_cost_comparison(ratio_2_to_1_input, ratio_2_to_1_output)

    ratio_3_to_1_input = total_tokens
    ratio_3_to_1_output = total_tokens // 3
    print("\n--- Scenario: Input/Output Ratio 3:1 ---")
    print_token_cost_comparison(ratio_3_to_1_input, ratio_3_to_1_output)

if __name__ == '__main__':
    main()
