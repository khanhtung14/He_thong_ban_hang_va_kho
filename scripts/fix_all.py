import os

for root, dirs, files in os.walk("backend/app"):
    for file in files:
        if file.endswith(".py"):
            filepath = os.path.join(root, file)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            orig = content
            content = content.replace("src.backend.models", "app.models.models")
            content = content.replace("src.backend.", "app.")
            
            if orig != content:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(content)
