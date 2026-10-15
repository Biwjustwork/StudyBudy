import './style.css';

type ApiError = { error?: string; message?: string };
type AuthResponse = { token?: string; accessToken?: string; userId?: string; id?: string; user?: { id?: string; userId?: string } };
type Profile = { id: string; name: string; email?: string; subjects: string[] };
type SearchProfile = { id: string; name: string; subjects: string[] };

const authUrl = import.meta.env.VITE_AUTH_URL ?? 'http://localhost:3001';
const profileUrl = import.meta.env.VITE_PROFILE_URL ?? 'http://localhost:3002';
const storageKeys = { token: 'study-buddy-token', userId: 'study-buddy-user-id' };

const byId = <T extends HTMLElement>(id: string) => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing page element: ${id}`);
  return element as T;
};

const authView = byId<HTMLElement>('auth-view');
const profileView = byId<HTMLElement>('profile-view');
const loginForm = byId<HTMLFormElement>('login-form');
const registerForm = byId<HTMLFormElement>('register-form');
const authMessage = byId<HTMLElement>('auth-message');
const profileMessage = byId<HTMLElement>('profile-message');
const token = () => sessionStorage.getItem(storageKeys.token);
const userId = () => sessionStorage.getItem(storageKeys.userId);

async function request<T>(baseUrl: string, path: string, init: RequestInit = {}, authenticated = false): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (authenticated && token()) headers.set('Authorization', `Bearer ${token()}`);
  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, { ...init, headers });
  } catch {
    throw new Error('เชื่อมต่อบริการไม่ได้ ตรวจสอบว่า service เปิดอยู่และ URL ถูกต้อง');
  }
  const body = await response.json().catch(() => ({})) as T & ApiError;
  if (!response.ok) {
    if (response.status === 401 && authenticated) clearSession();
    throw new Error(body.message || `เกิดข้อผิดพลาด (${response.status})`);
  }
  return body;
}

function showMessage(element: HTMLElement, message: string, isError = false) {
  element.textContent = message;
  element.classList.toggle('is-error', isError);
}

function clearSession() {
  sessionStorage.removeItem(storageKeys.token);
  sessionStorage.removeItem(storageKeys.userId);
}

function showLogin(message = '') {
  authView.classList.remove('hidden');
  profileView.classList.add('hidden');
  byId<HTMLButtonElement>('logout-button').classList.add('hidden');
  if (message) showMessage(authMessage, message, true);
}

function showWorkspace() {
  authView.classList.add('hidden');
  profileView.classList.remove('hidden');
  byId<HTMLButtonElement>('logout-button').classList.remove('hidden');
}

function setAuthTab(tab: 'login' | 'register') {
  const loginSelected = tab === 'login';
  byId<HTMLButtonElement>('login-tab').classList.toggle('active', loginSelected);
  byId<HTMLButtonElement>('register-tab').classList.toggle('active', !loginSelected);
  byId<HTMLButtonElement>('login-tab').setAttribute('aria-selected', String(loginSelected));
  byId<HTMLButtonElement>('register-tab').setAttribute('aria-selected', String(!loginSelected));
  loginForm.classList.toggle('hidden', !loginSelected);
  registerForm.classList.toggle('hidden', loginSelected);
  byId<HTMLElement>('auth-title').textContent = loginSelected ? 'กลับมาแล้ว ยินดีต้อนรับ' : 'มาเริ่มอ่านด้วยกัน';
  showMessage(authMessage, '');
}

async function resolveUserId(auth: AuthResponse, accessToken: string): Promise<string> {
  const id = auth.userId ?? auth.user?.userId ?? auth.user?.id ?? auth.id;
  if (id) return id;
  const me = await request<AuthResponse>(authUrl, '/api/me', {
    headers: { Authorization: `Bearer ${accessToken}` }
  }, true);
  const resolved = me.userId ?? me.user?.userId ?? me.user?.id ?? me.id;
  if (!resolved) throw new Error('ไม่พบ userId ในข้อมูลจาก Auth Service');
  return resolved;
}

async function enterWorkspace(auth: AuthResponse) {
  const accessToken = auth.token ?? auth.accessToken;
  if (!accessToken) throw new Error('Auth Service ไม่ได้ส่ง token กลับมา');
  sessionStorage.setItem(storageKeys.token, accessToken);
  const id = await resolveUserId(auth, accessToken);
  sessionStorage.setItem(storageKeys.userId, id);
  showWorkspace();
  try {
    await loadProfile();
  } catch (error) {
    showMessage(profileMessage, error instanceof Error ? error.message : 'โหลดโปรไฟล์ไม่สำเร็จ', true);
  }
}

async function loadProfile() {
  const id = userId();
  if (!id) throw new Error('ไม่พบ userId กรุณาเข้าสู่ระบบใหม่');
  const profile = await request<Profile>(profileUrl, `/api/users/${encodeURIComponent(id)}`, {}, true);
  renderProfile(profile);
}

function renderProfile(profile: Profile) {
  const name = profile.name || 'นักเรียน';
  byId<HTMLElement>('welcome-name').textContent = name;
  byId<HTMLElement>('avatar-initial').textContent = name.trim().slice(0, 1) || 'S';
  byId<HTMLElement>('profile-name').textContent = name;
  byId<HTMLElement>('profile-email').textContent = profile.email || 'ยังไม่ได้ระบุอีเมล';
  byId<HTMLTextAreaElement>('subjects-input').value = profile.subjects.join('\n');
}

function renderSearchResults(profiles: SearchProfile[], subject: string) {
  const results = byId<HTMLElement>('search-results');
  results.replaceChildren();
  if (profiles.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const icon = document.createElement('span');
    icon.textContent = '⌕';
    const title = document.createElement('p');
    title.textContent = `ยังไม่พบเพื่อนที่สนใจ “${subject}”`;
    const hint = document.createElement('small');
    hint.textContent = 'ลองค้นหาวิชาอื่น หรือชวนเพื่อนมาเริ่มต้นด้วยกัน';
    empty.append(icon, title, hint);
    results.append(empty);
    return;
  }
  const heading = document.createElement('p');
  heading.className = 'results-count';
  heading.textContent = `พบ ${profiles.length} คนที่สนใจวิชานี้`;
  results.append(heading);
  for (const profile of profiles) {
    const card = document.createElement('article');
    card.className = 'person-card';
    const avatar = document.createElement('span');
    avatar.className = 'avatar avatar-small';
    avatar.textContent = profile.name.trim().slice(0, 1) || 'S';
    const info = document.createElement('div');
    info.className = 'person-info';
    const name = document.createElement('strong');
    name.textContent = profile.name;
    const subjects = document.createElement('span');
    subjects.textContent = profile.subjects.join(' · ');
    info.append(name, subjects);
    card.append(avatar, info);
    results.append(card);
  }
}

byId<HTMLButtonElement>('login-tab').addEventListener('click', () => setAuthTab('login'));
byId<HTMLButtonElement>('register-tab').addEventListener('click', () => setAuthTab('register'));

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = loginForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  button.disabled = true;
  showMessage(authMessage, 'กำลังเข้าสู่ระบบ…');
  const data = new FormData(loginForm);
  try {
    const auth = await request<AuthResponse>(authUrl, '/api/login', {
      method: 'POST', body: JSON.stringify({ username: data.get('username'), password: data.get('password') })
    });
    await enterWorkspace(auth);
  } catch (error) {
    showMessage(authMessage, error instanceof Error ? error.message : 'เข้าสู่ระบบไม่สำเร็จ', true);
  } finally { button.disabled = false; }
});

registerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = registerForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  button.disabled = true;
  showMessage(authMessage, 'กำลังสร้างบัญชี…');
  const data = new FormData(registerForm);
  try {
    await request(authUrl, '/api/register', {
      method: 'POST', body: JSON.stringify({ name: data.get('name'), email: data.get('email'), password: data.get('password') })
    });
    setAuthTab('login');
    byId<HTMLInputElement>('login-username').value = String(data.get('email') ?? '');
    showMessage(authMessage, 'สร้างบัญชีแล้ว เข้าสู่ระบบเพื่อเริ่มตั้งค่าวิชาที่สนใจ');
  } catch (error) {
    showMessage(authMessage, error instanceof Error ? error.message : 'สร้างบัญชีไม่สำเร็จ', true);
  } finally { button.disabled = false; }
});

byId<HTMLFormElement>('subjects-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = byId<HTMLFormElement>('subjects-form').querySelector<HTMLButtonElement>('button[type="submit"]')!;
  button.disabled = true;
  try {
    const subjects = byId<HTMLTextAreaElement>('subjects-input').value.split('\n').map((item) => item.trim()).filter(Boolean);
    const profile = await request<Profile>(profileUrl, `/api/users/${encodeURIComponent(userId() ?? '')}`, {
      method: 'PUT', body: JSON.stringify({ subjects })
    }, true);
    renderProfile(profile);
    showMessage(profileMessage, 'บันทึกวิชาที่สนใจแล้ว');
  } catch (error) {
    showMessage(profileMessage, error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ', true);
  } finally { button.disabled = false; }
});

byId<HTMLFormElement>('search-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const subject = byId<HTMLInputElement>('search-subject').value.trim();
  if (!subject) return;
  const button = byId<HTMLFormElement>('search-form').querySelector<HTMLButtonElement>('button[type="submit"]')!;
  button.disabled = true;
  try {
    const profiles = await request<SearchProfile[]>(profileUrl, `/api/users/search?subject=${encodeURIComponent(subject)}`, {}, true);
    renderSearchResults(profiles.filter((profile) => profile.id !== userId()), subject);
  } catch (error) {
    renderSearchResults([], subject);
    showMessage(profileMessage, error instanceof Error ? error.message : 'ค้นหาไม่สำเร็จ', true);
  } finally { button.disabled = false; }
});

byId<HTMLButtonElement>('logout-button').addEventListener('click', () => {
  clearSession();
  showLogin();
  setAuthTab('login');
  loginForm.reset();
});

if (token() && userId()) {
  showWorkspace();
  loadProfile().catch((error: unknown) => showLogin(error instanceof Error ? error.message : 'เซสชันหมดอายุ'));
}
