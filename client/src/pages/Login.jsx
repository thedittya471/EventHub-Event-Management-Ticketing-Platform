import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import AuthLayout, { PasswordVisibilityIcon } from './AuthLayout.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../auth/useAuth.js';

const inputClassName =
  'h-12 w-full rounded-lg border border-[#3A3348] bg-[#14141B] px-4 text-sm text-white outline-none placeholder:text-[#71717A] focus-visible:border-[#8B5CF6]';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const { setUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  async function handleSubmit(e) {
    e.preventDefault();

    const nextErrors = {};
    const cleanEmail = email.trim();

    if (!cleanEmail) nextErrors.email = 'Enter your email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      nextErrors.email = 'Enter a valid email address.';
    }

    if (!password) nextErrors.password = 'Enter your password.';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setLoading(true);

    try {
      const response = await api('/auth/login', {
        method: 'POST',
        body: { email: cleanEmail, password },
      });

      setUser(response.data);

      const destinations = [location.state?.from, params.get('next')];
      const next = destinations.find(
        (destination) =>
          typeof destination === 'string' &&
          destination.startsWith('/') &&
          !destination.startsWith('//')
      );
      navigate(next || '/', { replace: true });
    } catch (error) {
      setErrors({
        password:
          error.status === 401 ? 'Invalid email or password.' : undefined,
        form:
          error.status === 401 ? undefined : error.message || 'Login failed.',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome Back"
      subtitle="Enter your email and password to access your account."
      footer={
        <>
          Don't Have An Account? <Link to="/signup">Register Now.</Link>
        </>
      }
    >
      <form className="space-y-5" noValidate onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            className={inputClassName}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setErrors((old) => ({
                ...old,
                email: undefined,
                form: undefined,
              }));
            }}
            aria-invalid={!!errors.email}
          />
          {errors.email && (
            <p className="text-xs text-red-400">{errors.email}</p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="login-password">Password</label>
          <div className="relative">
            <input
              id="login-password"
              className={`${inputClassName} pr-12`}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErrors((old) => ({
                  ...old,
                  password: undefined,
                  form: undefined,
                }));
              }}
              aria-invalid={!!errors.password}
            />
            <button
              type="button"
              className="absolute right-3 top-3"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              <PasswordVisibilityIcon visible={showPassword} />
            </button>
          </div>
          {errors.password && (
            <p className="text-xs text-red-400">{errors.password}</p>
          )}
        </div>

        {errors.form && (
          <p role="alert" className="text-xs text-red-400">
            {errors.form}
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-400">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            Remember Me
          </label>
          <a href="#forgot-password" className="text-sm text-purple-400">
            Forgot Password?
          </a>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="h-12 w-full rounded-lg bg-[#8B5CF6] font-semibold text-white disabled:opacity-60"
        >
          {loading ? 'Logging In...' : 'Log In'}
        </button>
      </form>
    </AuthLayout>
  );
}

export default Login;
