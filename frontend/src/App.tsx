import { useEffect, useState } from "react";
import "./App.css";

type Profile = {
  username: string;
  full_name: string;
  phone: string;
  role: string;
  warehouse: string;
  area: string;
};

function App() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("http://127.0.0.1:8001/profile")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Không thể lấy thông tin hồ sơ");
        }
        return response.json();
      })
      .then((data) => {
        setProfile(data);
        setFullName(data.full_name);
        setPhone(data.phone);
      })
      .catch(() => {
        setError("Không thể kết nối đến Backend.");
      });
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    setMessage("");
    setError("");

    if (!fullName.trim()) {
      setError("Họ và tên không được để trống.");
      return;
    }

    if (!/^0\d{9}$/.test(phone.trim())) {
      setError(
        "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng số 0."
      );
      return;
    }

    try {
      const response = await fetch("http://127.0.0.1:8001/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          full_name: fullName.trim(),
          phone: phone.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.detail || "Cập nhật hồ sơ thất bại.");
        return;
      }

      setProfile(data.profile);
      setMessage("Cập nhật hồ sơ thành công.");
    } catch {
      setError("Không thể kết nối đến Backend.");
    }
  };

  if (!profile) {
    return (
      <div className="container">
        <h1>Hồ sơ cá nhân</h1>
        <p>{error || "Đang tải thông tin..."}</p>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="profile-card">
        <h1>Hồ sơ cá nhân</h1>

        <form onSubmit={handleSubmit}>
          <label>Tài khoản</label>
          <input value={profile.username} disabled />

          <label>Họ và tên</label>
          <input
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />

          <label>Số điện thoại</label>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />

          <label>Vai trò</label>
          <input value={profile.role} disabled />

          <label>Kho</label>
          <input value={profile.warehouse} disabled />

          <label>Địa bàn</label>
          <input value={profile.area} disabled />

          {error && <p className="error">{error}</p>}
          {message && <p className="success">{message}</p>}

          <button type="submit">Cập nhật hồ sơ</button>
        </form>
      </div>
    </div>
  );
}

export default App;