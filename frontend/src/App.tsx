import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import "./App.css";

type Profile = {
  username: string;
  full_name: string;
  phone: string;
  role: string;
  warehouse: string;
  area: string;
};

const BACKEND_URL = "http://127.0.0.1:8001";

function App() {
  const [profile, setProfile] = useState<Profile | null>(null);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Avatar
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarMessage, setAvatarMessage] = useState("");
  const [avatarError, setAvatarError] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    // Lấy thông tin hồ sơ
    fetch(`${BACKEND_URL}/profile`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Không thể lấy thông tin hồ sơ.");
        }

        return response.json();
      })
      .then((data: Profile) => {
        setProfile(data);
        setFullName(data.full_name);
        setPhone(data.phone);
      })
      .catch(() => {
        setError("Không thể kết nối đến Backend.");
      });

    // Lấy ảnh đại diện hiện tại
    fetch(`${BACKEND_URL}/profile/avatar`)
      .then((response) => {
        if (response.ok) {
          // Thêm timestamp để tránh trình duyệt dùng ảnh cũ trong cache
          setAvatarUrl(
            `${BACKEND_URL}/profile/avatar?t=${Date.now()}`
          );
        }
      })
      .catch(() => {
        // Chưa có ảnh đại diện thì giữ trạng thái "Chưa có ảnh"
      });
  }, []);

  // Cập nhật hồ sơ
  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    setMessage("");
    setError("");

    const trimmedFullName = fullName.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedFullName) {
      setError("Họ và tên không được để trống.");
      return;
    }

    if (!/^0\d{9}$/.test(trimmedPhone)) {
      setError(
        "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng số 0."
      );
      return;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          full_name: trimmedFullName,
          phone: trimmedPhone,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.detail || "Cập nhật hồ sơ thất bại."
        );
        return;
      }

      setProfile(data.profile);
      setMessage("Cập nhật hồ sơ thành công.");
    } catch {
      setError("Không thể kết nối đến Backend.");
    }
  };

  // Upload ảnh đại diện
  const handleAvatarUpload = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setAvatarMessage("");
    setAvatarError("");

    // Kiểm tra định dạng ở Frontend
    const allowedTypes = [
      "image/jpeg",
      "image/png",
    ];

    if (!allowedTypes.includes(file.type)) {
      setAvatarError(
        "Chỉ cho phép tải ảnh JPG hoặc PNG."
      );

      // Cho phép chọn lại cùng một file
      event.target.value = "";
      return;
    }

    // Kiểm tra dung lượng ở Frontend
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError(
        "Ảnh không được vượt quá 2MB."
      );

      event.target.value = "";
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setUploadingAvatar(true);

    try {
      const response = await fetch(
        `${BACKEND_URL}/profile/avatar`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setAvatarError(
          data.detail || "Tải ảnh đại diện thất bại."
        );
        return;
      }

      // Dùng URL mà Backend trả về
      setAvatarUrl(
        `${BACKEND_URL}${data.avatar_url}?t=${Date.now()}`
      );

      setAvatarMessage(
        "Tải ảnh đại diện thành công."
      );
    } catch {
      setAvatarError(
        "Không thể kết nối đến Backend."
      );
    } finally {
      setUploadingAvatar(false);

      // Cho phép chọn lại cùng một file
      event.target.value = "";
    }
  };

  if (!profile) {
    return (
      <div className="container">
        <div className="profile-card">
          <h1>Hồ sơ cá nhân</h1>
          <p>{error || "Đang tải thông tin..."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="profile-card">
        <h1>Hồ sơ cá nhân</h1>

        {/* ==================== ẢNH ĐẠI DIỆN ==================== */}
        <div className="avatar-section">
          <h2>Ảnh đại diện</h2>

          <div className="avatar-preview">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Ảnh đại diện"
              />
            ) : (
              <div className="avatar-placeholder">
                Chưa có ảnh
              </div>
            )}
          </div>

          <div className="avatar-upload">
            <label htmlFor="avatar-file">
              Chọn ảnh
            </label>

            <input
              id="avatar-file"
              type="file"
              accept=".jpg,.jpeg,.png,image/jpeg,image/png"
              onChange={handleAvatarUpload}
              disabled={uploadingAvatar}
            />
          </div>

          <p className="avatar-note">
            Chỉ chấp nhận JPG hoặc PNG, tối đa 2MB.
          </p>

          {uploadingAvatar && (
            <p>Đang tải ảnh lên...</p>
          )}

          {avatarError && (
            <p className="error">
              {avatarError}
            </p>
          )}

          {avatarMessage && (
            <p className="success">
              {avatarMessage}
            </p>
          )}
        </div>

        {/* ==================== THÔNG TIN HỒ SƠ ==================== */}
        <form onSubmit={handleSubmit}>
          <label>Tài khoản</label>
          <input
            type="text"
            value={profile.username}
            disabled
          />

          <label>Họ và tên</label>
          <input
            type="text"
            value={fullName}
            onChange={(event) =>
              setFullName(event.target.value)
            }
          />

          <label>Số điện thoại</label>
          <input
            type="text"
            value={phone}
            onChange={(event) =>
              setPhone(event.target.value)
            }
          />

          <label>Vai trò</label>
          <input
            type="text"
            value={profile.role}
            disabled
          />

          <label>Kho</label>
          <input
            type="text"
            value={profile.warehouse}
            disabled
          />

          <label>Địa bàn</label>
          <input
            type="text"
            value={profile.area}
            disabled
          />

          {error && (
            <p className="error">
              {error}
            </p>
          )}

          {message && (
            <p className="success">
              {message}
            </p>
          )}

          <button type="submit">
            Cập nhật hồ sơ
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;