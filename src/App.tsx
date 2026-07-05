import {
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { FiLogOut } from 'react-icons/fi'
import { MdLocalHospital } from 'react-icons/md'
import { PiCameraPlus } from 'react-icons/pi'
import { HiOutlineArrowRight } from 'react-icons/hi2'
import { HiOutlineArrowLeft } from 'react-icons/hi2'
import { LuImage, LuLoaderCircle, LuShieldAlert, LuHistory } from 'react-icons/lu'
import { FaRegEye, FaRegEyeSlash } from 'react-icons/fa6'
import './App.css'

const API_BASE = 'https://pdl-api.razik.workers.dev'

type AuthState = {
  token: string | null
  email: string | null
  signIn: (token: string, email: string) => void
  signOut: () => void
}

type LoginResponse = {
  success: boolean
  message: string
  token: string
}

type RegisterResponse = {
  success: boolean
  message: string
  data: {
    userId: string
    email: string
  }
}

type PredictResponse = {
  success: boolean
  message: string
  data: {
    id: string
    prediction: string
    confidence: number
    probabilities: Record<string, number>
    imageKey: string
    createdAt: number
  }
}

type HistoryItem = {
  id: string
  predictedClass: string
  confidence: number
  probabilities: Record<string, number>
  imageKey: string
  createdAt: number
}

type HistoryResponse = {
  success: boolean
  data: {
    items: HistoryItem[]
    pagination: {
      page: number
      limit: number
      totalItems: number
      totalPages: number
    }
  }
}

type HistoryDetailState = {
  item: HistoryItem
  preview?: string
}

type ApiError = {
  message?: string
  error?: string
}

type AuthFormMode = 'login' | 'register'

const AuthContext = createContext<AuthState | null>(null)

function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

async function requestJson<T>(
  path: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
    },
  })

  const contentType = response.headers.get('content-type') ?? ''
  const payload = contentType.includes('application/json')
    ? ((await response.json()) as T & ApiError)
    : (null as T)

  if (!response.ok) {
    const error = payload as T & ApiError
    throw new Error(error?.message || error?.error || 'Request failed')
  }

  return payload as T
}

async function login(email: string, password: string) {
  return requestJson<LoginResponse>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
}

async function register(email: string, password: string) {
  return requestJson<RegisterResponse>('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
}

async function predictImage(token: string, image: File) {
  const formData = new FormData()
  formData.append('image', image)

  return requestJson<PredictResponse>('/api/predict', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })
}

async function fetchHistory(token: string, page = 1, limit = 10) {
  return requestJson<HistoryResponse>(
    `/api/history?page=${page}&limit=${limit}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    },
  )
}

function toClassLabel(code: string) {
  const labels: Record<string, string> = {
    AK: 'Actinic Keratoses',
    BCC: 'Basal Cell Carcinoma',
    BKL: 'Benign Keratosis',
    MEL: 'Melanoma',
    NV: 'Melanocytic Nevi',
    SCC: 'Squamous Cell Carcinoma',
  }
  return labels[code] ?? code
}

function formatDate(value: number) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value))
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(value >= 0.1 ? 1 : 2)}%`
}

function App() {
  const [token, setToken] = useState<string | null>(
    localStorage.getItem('dermascan_token'),
  )
  const [email, setEmail] = useState<string | null>(
    localStorage.getItem('dermascan_email'),
  )

  const auth = useMemo(
    () => ({
      token,
      email,
      signIn(nextToken: string, nextEmail: string) {
        setToken(nextToken)
        setEmail(nextEmail)
        localStorage.setItem('dermascan_token', nextToken)
        localStorage.setItem('dermascan_email', nextEmail)
      },
      signOut() {
        setToken(null)
        setEmail(null)
        localStorage.removeItem('dermascan_token')
        localStorage.removeItem('dermascan_email')
        localStorage.removeItem('dermascan_latest_prediction')
      },
    }),
    [email, token],
  )

  useEffect(() => {
    if (!token) {
      localStorage.removeItem('dermascan_latest_prediction')
    }
  }, [token])

  return (
    <AuthContext.Provider value={auth}>
      <Routes>
        <Route
          path="/"
          element={token ? <Navigate to="/app" replace /> : <AuthPage />}
        />
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <MainLayout>
                <ClassificationPage />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <MainLayout>
                <HistoryPage />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/history/:id"
          element={
            <ProtectedRoute>
              <MainLayout>
                <HistoryDetailPage />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthContext.Provider>
  )
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  if (!token) {
    return <Navigate to="/" replace />
  }
  return children
}

function MainLayout({ children }: { children: ReactNode }) {
  const { signOut } = useAuth()
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <MdLocalHospital />
          <span>DermaScan AI</span>
        </div>
        <nav className="nav">
          <NavLink to="/app" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Utama
          </NavLink>
          <NavLink to="/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Riwayat
          </NavLink>
        </nav>
        <button className="ghost-btn" onClick={signOut} type="button">
          <FiLogOut />
          Keluar
        </button>
      </header>
      <main className="page">{children}</main>
      <footer className="footer">
        <div className="footer-brand">DermaScan AI</div>
        <div className="footer-links">
          <span>Privasi</span>
          <span>Syarat & Ketentuan</span>
          <span>Bantuan</span>
        </div>
        <p>
          © 2024 DermaScan AI. Layanan ini hanya untuk tujuan informasi dan
          bukan pengganti saran medis profesional.
        </p>
      </footer>
    </div>
  )
}

function AuthPage() {
  const [mode, setMode] = useState<AuthFormMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { signIn } = useAuth()

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      if (mode === 'login') {
        const result = await login(email, password)
        signIn(result.token, email)
      } else {
        await register(email, password)
        const result = await login(email, password)
        signIn(result.token, email)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <div className="brand brand-large">
          <MdLocalHospital />
          <span>DermaScan AI</span>
        </div>
        <h1>Mulai Deteksi Risiko Kanker Kulit dengan AI</h1>
        <p>
          Masuk untuk mengunggah gambar, melihat hasil klasifikasi, dan
          membuka riwayat analisis Anda.
        </p>
      </div>

      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-switch">
          <button
            type="button"
            className={mode === 'login' ? 'tab active' : 'tab'}
            onClick={() => setMode('login')}
          >
            Login
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'tab active' : 'tab'}
            onClick={() => setMode('register')}
          >
            Daftar
          </button>
        </div>
        <h2>{mode === 'login' ? 'Login Akun' : 'Daftar Akun'}</h2>
        <p className="muted">
          {mode === 'login'
            ? 'Masuk untuk mulai menggunakan layanan'
            : 'Buat akun baru untuk menyimpan riwayat klasifikasi'}
        </p>
        <label className="field">
          <span>Alamat Email</span>
          <div className="input-wrap">
            <LuImage className="input-icon" />
            <input
              type="email"
              placeholder="nama@email.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
        </label>
        <label className="field">
          <span>Kata Sandi</span>
          <div className="input-wrap">
            <LuShieldAlert className="input-icon" />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
            />
            <button
              type="button"
              className="input-append"
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? <FaRegEyeSlash /> : <FaRegEye />}
            </button>
          </div>
          <small>Minimal 8 karakter.</small>
        </label>
        {error ? <div className="alert">{error}</div> : null}
      <button className="primary-btn" type="submit" disabled={loading}>
          {loading ? <LuLoaderCircle className="spin" /> : null}
          {mode === 'login' ? 'Masuk' : 'Daftar'}
          {!loading ? <HiOutlineArrowRight /> : null}
        </button>
      </form>
    </div>
  )
}

function ClassificationPage() {
  const { token } = useAuth()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PredictResponse['data'] | null>(null)
  const [error, setError] = useState('')

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!file || !token) return
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const response = await predictImage(token, file)
      setResult(response.data)
      localStorage.setItem(
        'dermascan_latest_prediction',
        JSON.stringify({
          ...response.data,
          preview,
          filename: file.name,
        }),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memproses gambar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="content-stack">
      <div className="hero-copy">
        <h1>Analisis Scan Kulit</h1>
        <p>
          Unggah foto area kulit, lalu AI akan memproses gambar untuk
          memberikan klasifikasi awal sesuai hasil dari API.
        </p>
      </div>
      {!result ? (
        <form className="upload-card" onSubmit={handleSubmit}>
          <input
            id="image-upload"
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const selected = event.target.files?.[0] ?? null
              setFile(selected)
              setPreview(selected ? URL.createObjectURL(selected) : '')
            }}
          />
          <label className="dropzone" htmlFor="image-upload">
            <PiCameraPlus />
            <h2>Seret & Lepas Gambar</h2>
            <p>Atau klik untuk menelusuri file (JPG, PNG)</p>
            {preview ? <img src={preview} alt="Pratinjau gambar" /> : null}
            <span className="secondary-btn">Pilih Gambar</span>
          </label>
          {error ? <div className="alert">{error}</div> : null}
          <div className="notice">
            <strong>Catatan Penting</strong>
            <p>
              Hasil ini adalah simulasi berbasis AI dan tidak menggantikan
              diagnosis medis resmi.
            </p>
          </div>
          <button className="primary-btn" type="submit" disabled={!file || loading}>
            {loading ? <LuLoaderCircle className="spin" /> : null}
            {loading ? 'Memproses...' : 'Mulai Analisis'}
          </button>
        </form>
      ) : (
        <ResultView data={result} preview={preview} onReset={() => {
          setResult(null)
          setFile(null)
          setPreview('')
        }} />
      )}
    </section>
  )
}

function ResultView({
  data,
  preview,
  onReset,
}: {
  data: PredictResponse['data']
  preview: string
  onReset: () => void
}) {
  const ordered = Object.entries(data.probabilities).sort((a, b) => b[1] - a[1])
  return (
    <div className="result-layout">
      <img className="result-image" src={preview} alt="Hasil scan" />
      <div className="result-panel">
        <span className="warning-pill">Peringatan Medis</span>
        <div className="result-head">
          <div>
            <h2>
              {data.prediction} - {toClassLabel(data.prediction)}
            </h2>
            <p>Hasil klasifikasi otomatis berdasarkan citra yang diunggah.</p>
          </div>
          <div className="confidence">
            <strong>{formatPercent(data.confidence)}</strong>
            <span>Confidence Level</span>
          </div>
        </div>
        <div className="result-note">
          Hasil ini bukan diagnosis final. Hubungi tenaga medis profesional
          segera.
        </div>
        <div className="probability-card">
          <h3>Distribusi Probabilitas Kelas</h3>
          {ordered.map(([code, value]) => (
            <div className="prob-row" key={code}>
              <div className="prob-head">
                <span>
                  {code} - {toClassLabel(code)}
                </span>
                <span>{formatPercent(value)}</span>
              </div>
              <div className="bar">
                <div className="fill" style={{ width: `${value * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <button className="secondary-action" type="button" onClick={onReset}>
        <HiOutlineArrowLeft />
        Mulai Analisis Baru
      </button>
    </div>
  )
}

function HistoryPage() {
  const { token } = useAuth()
  const latestPredictionRaw = localStorage.getItem('dermascan_latest_prediction')
  const latestPreview = latestPredictionRaw
    ? ((JSON.parse(latestPredictionRaw) as { preview?: string }).preview ?? '')
    : ''
  const [items, setItems] = useState<HistoryItem[]>([])
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    totalItems: 0,
    totalPages: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (!token) return
    setLoading(true)
    setError('')
    fetchHistory(token, page, 10)
      .then((response) => {
        setItems(response.data.items)
        setPagination(response.data.pagination)
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Gagal memuat riwayat'),
      )
      .finally(() => setLoading(false))
  }, [page, token])

  return (
    <section className="content-stack">
      <div className="hero-copy">
        <h1>Riwayat Klasifikasi</h1>
        <p>Daftar analisis kesehatan kulit yang telah Anda lakukan sebelumnya.</p>
      </div>
      <div className="stats-row">
        <div className="stat-card">
          <span>Total Scan</span>
          <strong>{pagination.totalItems}</strong>
        </div>
        <div className="stat-card">
          <span>Halaman</span>
          <strong>{pagination.page}</strong>
        </div>
      </div>
      <div className="history-card">
        {loading ? (
          <div className="loading-state">
            <LuLoaderCircle className="spin" />
            Memuat riwayat...
          </div>
        ) : error ? (
          <div className="alert">{error}</div>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <LuHistory />
            <p>Belum ada riwayat klasifikasi.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Hasil Klasifikasi</th>
                <th>Confidence Level</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{formatDate(item.createdAt)}</td>
                  <td>
                    <span className="class-pill">{item.predictedClass}</span>
                  </td>
                  <td>
                    <div className="history-confidence">
                      <div className="bar small">
                        <div
                          className="fill"
                          style={{ width: `${item.confidence * 100}%` }}
                        />
                      </div>
                      <strong>{formatPercent(item.confidence)}</strong>
                    </div>
                  </td>
                  <td>
                    <Link
                      className="primary-link"
                      to={`/history/${item.id}`}
                      state={{ item, preview: latestPreview } satisfies HistoryDetailState}
                    >
                      Lihat Detail
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {pagination.totalPages > 1 ? (
        <div className="pagination">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            <HiOutlineArrowLeft />
          </button>
          {Array.from({ length: pagination.totalPages }, (_, index) => index + 1)
            .slice(0, 3)
            .map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                className={pageNumber === page ? 'active' : ''}
                onClick={() => setPage(pageNumber)}
              >
                {pageNumber}
              </button>
            ))}
          <button
            type="button"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage((value) => Math.min(pagination.totalPages, value + 1))}
          >
            <HiOutlineArrowRight />
          </button>
        </div>
      ) : null}
    </section>
  )
}

function HistoryDetailPage() {
  const location = useLocation()
  const state = location.state as HistoryDetailState | null
  const latestPrediction = localStorage.getItem('dermascan_latest_prediction')
  const parsedLatest = latestPrediction ? (JSON.parse(latestPrediction) as { preview?: string; item?: HistoryItem }) : null
  const record = state?.item ?? parsedLatest?.item ?? null
  const preview = state?.preview ?? parsedLatest?.preview ?? ''

  if (!record) {
    return (
      <div className="content-stack">
        <div className="hero-copy">
          <h1>Detail Analisis Skin Scan</h1>
          <p>Detail ini diambil dari data riwayat yang tersedia di API.</p>
        </div>
        <div className="empty-state">
          <LuHistory />
          <p>Data detail belum tersedia untuk sesi ini.</p>
        </div>
      </div>
    )
  }

  const ordered = Object.entries(record.probabilities).sort((a, b) => b[1] - a[1])

  return (
    <section className="content-stack">
      <div className="breadcrumbs">Riwayat &gt; Detail Analisis</div>
      <div className="hero-copy">
        <h1>Detail Analisis Skin Scan</h1>
        <div className="date-badge">{formatDate(record.createdAt)}</div>
      </div>
      <div className="detail-layout">
        <div className="detail-image-card">
          <div className="detail-image">
            {preview ? <img src={preview} alt="Gambar input" /> : null}
          </div>
          <div className="detail-tag">Gambar Input Digital</div>
        </div>
        <div className="result-panel">
          <span className="warning-pill">Peringatan Medis</span>
          <div className="result-head">
            <div>
              <h2>
                {record.predictedClass} - {toClassLabel(record.predictedClass)}
              </h2>
              <p>Hasil klasifikasi otomatis berdasarkan citra yang diunggah.</p>
            </div>
            <div className="confidence">
              <strong>{formatPercent(record.confidence)}</strong>
              <span>Confidence Level</span>
            </div>
          </div>
          <div className="result-note">
            Hasil ini bukan diagnosis final. Hubungi tenaga medis profesional
            segera.
          </div>
          <div className="probability-card">
            <h3>Distribusi Probabilitas Kelas</h3>
            {ordered.map(([code, value]) => (
              <div className="prob-row" key={code}>
                <div className="prob-head">
                  <span>
                    {code} - {toClassLabel(code)}
                  </span>
                  <span>{formatPercent(value)}</span>
                </div>
                <div className="bar">
                  <div className="fill" style={{ width: `${value * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <Link className="secondary-action link" to="/history">
        <HiOutlineArrowLeft />
        Kembali ke Riwayat
      </Link>
    </section>
  )
}

export default App
