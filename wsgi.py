import sys
import os
import importlib.util

# Đường dẫn đến file lark_server.py bên trong folder con
base_dir = os.path.dirname(__file__)
script_path = os.path.join(base_dir, "02_System_va_Tools", "lark_server.py")

spec = importlib.util.spec_from_file_location("lark_server", script_path)
lark_server_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lark_server_module)

# Xuất biến app (Flask) ra ngoài cho Gunicorn gọi
app = lark_server_module.app

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
