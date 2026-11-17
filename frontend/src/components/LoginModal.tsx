import { useState, type FormEvent } from "react";
import { login } from "../api";
import type { User } from "../types";
import {
  ErrorMessage,
  Modal,
  Spinner,
  inputClass,
  labelClass,
  submitButtonClass,
} from "./ui";

interface LoginModalProps {
  onClose: () => void;
  onSuccess: (user: User) => void;
}

// There is no sign-up: accounts are created by an admin.
export default function LoginModal({ onClose, onSuccess }: LoginModalProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (!username.trim()) {
      setError("Please enter your username.");
      return;
    }

    setLoading(true);

    try {
      onSuccess(await login(username.trim(), password));
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Please try again.",
      );
      setLoading(false);
    }
  };

  return (
    <Modal onClose={onClose} busy={loading} label="Sign in">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="username" className={labelClass}>
            Username
          </label>

          <input
            id="username"
            type="text"
            autoComplete="username"
            autoFocus
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="your_username"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="password" className={labelClass}>
            Password
          </label>

          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </div>

        {error && <ErrorMessage>{error}</ErrorMessage>}

        <button type="submit" disabled={loading} className={submitButtonClass}>
          {loading && <Spinner />}
          {loading ? "Please wait..." : "Sign in"}
        </button>
      </form>
    </Modal>
  );
}
