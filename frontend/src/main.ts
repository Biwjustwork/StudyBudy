import './style.css';

// ================= Types =================
type ApiError = { error?: string; message?: string };

const apiErrorTranslations: Record<string, string> = {
  'A request already exists for this user and group': 'คุณส่งคำขอเข้าร่วมกลุ่มนี้ไปแล้ว กรุณารอผลการพิจารณา',
  'User is already a group member or owner': 'คุณเป็นสมาชิกหรือเจ้าของกลุ่มนี้อยู่แล้ว',
  'Group is full or closed for new members': 'กลุ่มนี้เต็มแล้วหรือปิดรับสมาชิกใหม่',
  'Group is full': 'กลุ่มนี้มีสมาชิกครบแล้ว',
  'Group is closed for new members': 'กลุ่มนี้ปิดรับสมาชิกใหม่แล้ว',
  'Email or password is incorrect.': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  'An account with this email already exists.': 'อีเมลนี้มีบัญชีผู้ใช้แล้ว',
  'Email, name, or password does not meet the requirements.': 'อีเมล ชื่อ หรือรหัสผ่านไม่ตรงตามข้อกำหนด',
  'This registration is incomplete. Retry with the original details.': 'การสมัครยังไม่สมบูรณ์ กรุณาลองอีกครั้งด้วยข้อมูลเดิม',
  'Registration is incomplete. Retry with the same email, name, and password.': 'การสมัครยังไม่สมบูรณ์ กรุณาลองอีกครั้งด้วยอีเมล ชื่อ และรหัสผ่านเดิม',
  'The account for this token is unavailable.': 'ไม่พบบัญชีผู้ใช้สำหรับเซสชันนี้ กรุณาเข้าสู่ระบบใหม่',
  'A valid Bearer token is required.': 'กรุณาเข้าสู่ระบบใหม่อีกครั้ง',
  'Bearer token is required': 'กรุณาเข้าสู่ระบบใหม่อีกครั้ง',
  'Token is invalid or expired': 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
  'Token must contain a valid userId and exp': 'ข้อมูลเซสชันไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่',
  'Group not found': 'ไม่พบกลุ่มที่เลือก กลุ่มนี้อาจถูกลบไปแล้ว',
  'User is already a member of this group': 'คุณเป็นสมาชิกกลุ่มนี้อยู่แล้ว',
  'Only the group owner can view requests': 'เฉพาะเจ้าของกลุ่มเท่านั้นที่ดูคำขอเข้าร่วมได้',
  'Only the group owner can decide requests': 'เฉพาะเจ้าของกลุ่มเท่านั้นที่อนุมัติหรือปฏิเสธคำขอได้',
  'Request has already been decided or is being processed': 'คำขอนี้ได้รับการพิจารณาแล้วหรือกำลังดำเนินการ',
  'Request not found': 'ไม่พบคำขอเข้าร่วมนี้',
  'subject query is required': 'กรุณาระบุชื่อวิชาที่ต้องการค้นหา',
  'subjects must be an array of non-empty strings': 'กรุณาระบุชื่อวิชาอย่างน้อยหนึ่งวิชา และอย่าเว้นช่องว่าง',
  'subjects must not contain duplicates': 'มีชื่อวิชาซ้ำกัน กรุณาตรวจสอบอีกครั้ง',
  'You can only view your own profile': 'คุณดูได้เฉพาะโปรไฟล์ของตัวเอง',
  'You can only update your own profile': 'คุณแก้ไขได้เฉพาะโปรไฟล์ของตัวเอง',
  'User not found': 'ไม่พบข้อมูลผู้ใช้',
  'Request body must be valid JSON': 'ข้อมูลที่ส่งไม่ถูกต้อง กรุณาลองใหม่',
  'Request body is too large': 'ข้อมูลที่ส่งมีขนาดใหญ่เกินไป',
  'An unexpected error occurred.': 'ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง',
  'An unexpected error occurred': 'ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง',
};

function localizeApiError(data: ApiError, status: number): string {
  const message = data.message?.trim();
  if (message && apiErrorTranslations[message]) return apiErrorTranslations[message];
  if (message && /[\u0E00-\u0E7F]/.test(message)) return message;

  const errorCode = data.error?.toLowerCase();
  if (errorCode === 'conflict') return 'รายการนี้ซ้ำหรือไม่สามารถดำเนินการได้';
  if (errorCode === 'capacity_exceeded') return 'กลุ่มนี้เต็มแล้วหรือปิดรับสมาชิกใหม่';
  if (errorCode === 'not_found') return 'ไม่พบข้อมูลที่ต้องการ';
  if (errorCode === 'forbidden') return 'คุณไม่มีสิทธิ์ดำเนินการนี้';
  if (errorCode === 'unauthorized' || status === 401) return 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่';
  if (errorCode === 'validation_error') return 'ข้อมูลไม่ครบหรือไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่';
  if (status >= 500) return 'ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง';
  if (status === 404) return 'ไม่พบข้อมูลที่ต้องการ';
  if (status === 409) return 'รายการนี้ซ้ำหรือไม่สามารถดำเนินการได้';
  if (status === 422) return 'ไม่สามารถดำเนินการได้ กลุ่มอาจเต็มหรือปิดรับสมาชิกแล้ว';
  if (status === 400) return 'ข้อมูลไม่ครบหรือไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่';
  return 'ทำรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
}

type AuthResponse = {
  token?: string;
  accessToken?: string;
  userId?: string;
  id?: string;
  email?: string;
};

type Profile = {
  id: string;
  name: string;
  email?: string;
  subjects: string[];
};

type Classmate = {
  id: string;
  name: string;
  subjects: string[];
};

type Group = {
  id: string;
  subject: string;
  topic: string;
  startsAt: string;
  maxMembers: number;
  location: string;
  ownerId: string;
  members: string[];
  isOpen: boolean;
  description?: string;
  createdAt?: string;
};

type MembershipRequest = {
  id: string;
  groupId: string;
  requesterId: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
};

type NotificationItem = {
  id: string;
  userId: string;
  type: 'request_approved' | 'request_rejected';
  message: string;
  relatedId: string;
  read: boolean;
  createdAt: string;
  readAt: string | null;
};

// ================= Service URLs & Storage =================
const authUrl = import.meta.env.VITE_AUTH_URL ?? 'http://localhost:3001';
const profileUrl = import.meta.env.VITE_PROFILE_URL ?? 'http://localhost:3002';
const groupUrl = import.meta.env.VITE_GROUP_URL ?? 'http://localhost:3003';
const memberUrl = import.meta.env.VITE_MEMBERSHIP_URL ?? 'http://localhost:3004';
const notifyUrl = import.meta.env.VITE_NOTIFICATION_URL ?? 'http://localhost:3005';

const storageKeys = {
  token: 'study-buddy-token',
  userId: 'study-buddy-user-id',
};

const token = () => sessionStorage.getItem(storageKeys.token);
const currentUserId = () => sessionStorage.getItem(storageKeys.userId);

// Timer for background notification polling
let notificationPollTimer: number | null = null;

// ================= DOM Helper =================
const byId = <T extends HTMLElement>(id: string) => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing page element: #${id}`);
  return element as T;
};

// Elements
const authView = byId<HTMLElement>('auth-view');
const workspaceView = byId<HTMLElement>('workspace-view');
const userControls = byId<HTMLElement>('user-controls');
const loginForm = byId<HTMLFormElement>('login-form');
const registerForm = byId<HTMLFormElement>('register-form');
const authMessage = byId<HTMLElement>('auth-message');
const toastEl = byId<HTMLElement>('toast');

// Notification Elements
const notiToggleBtn = byId<HTMLButtonElement>('noti-toggle-btn');
const notiDropdown = byId<HTMLElement>('noti-dropdown');
const notiBadge = byId<HTMLElement>('noti-badge');
const notiList = byId<HTMLElement>('noti-list');
const notiRefreshBtn = byId<HTMLButtonElement>('noti-refresh-btn');
const notiCloseBtn = byId<HTMLButtonElement>('noti-close-btn');
const notiUnreadText = byId<HTMLElement>('noti-unread-text');

// Tabs & Content Elements
const tabGroups = byId<HTMLButtonElement>('tab-groups');
const tabRequests = byId<HTMLButtonElement>('tab-requests');
const tabProfile = byId<HTMLButtonElement>('tab-profile');
const contentGroups = byId<HTMLElement>('content-groups');
const contentRequests = byId<HTMLElement>('content-requests');
const contentProfile = byId<HTMLElement>('content-profile');
const requestsBadge = byId<HTMLElement>('requests-badge');

// Groups Elements
const groupsList = byId<HTMLElement>('groups-list');
const groupSearchForm = byId<HTMLFormElement>('group-search-form');
const groupSearchInput = byId<HTMLInputElement>('group-search-input');
const groupSearchOpenOnly = byId<HTMLInputElement>('group-search-open-only');
const groupResetBtn = byId<HTMLButtonElement>('group-reset-btn');
const openCreateGroupBtn = byId<HTMLButtonElement>('open-create-group-btn');
const createGroupModal = byId<HTMLElement>('create-group-modal');
const closeCreateGroupModalBtn = byId<HTMLButtonElement>('close-create-group-modal-btn');
const cancelCreateGroupBtn = byId<HTMLButtonElement>('cancel-create-group-btn');
const createGroupForm = byId<HTMLFormElement>('create-group-form');
const groupStartsAtInput = byId<HTMLInputElement>('group-starts-at');

// Requests Elements
const refreshRequestsBtn = byId<HTMLButtonElement>('refresh-requests-btn');
const ownerGroupsContainer = byId<HTMLElement>('owner-groups-container');

// Profile Elements
const welcomeName = byId<HTMLElement>('welcome-name');
const avatarInitial = byId<HTMLElement>('avatar-initial');
const profileName = byId<HTMLElement>('profile-name');
const profileEmail = byId<HTMLElement>('profile-email');
const profileUserId = byId<HTMLElement>('profile-user-id');
const subjectsForm = byId<HTMLFormElement>('subjects-form');
const subjectsInput = byId<HTMLTextAreaElement>('subjects-input');
const profileMessage = byId<HTMLElement>('profile-message');
const classmatesSearchForm = byId<HTMLFormElement>('classmates-search-form');
const classmatesSubjectInput = byId<HTMLInputElement>('classmates-subject-input');
const classmatesResults = byId<HTMLElement>('classmates-results');

// ================= Generic API Request =================
async function apiRequest<T>(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
  authenticated = true,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (authenticated && token()) {
    headers.set('Authorization', `Bearer ${token()}`);
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/+$/, '')}${path}`, { ...init, headers });
  } catch {
    throw new Error(`ไม่สามารถเชื่อมต่อ ${baseUrl} ได้ ตรวจสอบว่าบริการเปิดอยู่หรือไม่`);
  }

  const data = (await response.json().catch(() => ({}))) as T & ApiError;

  if (!response.ok) {
    if (response.status === 401 && authenticated) {
      handleSessionExpired();
    }
    throw new Error(localizeApiError(data, response.status));
  }

  return data;
}

// ================= Utility Functions =================
function showToast(message: string, isError = false) {
  toastEl.textContent = message;
  toastEl.style.background = isError ? '#9e3b30' : '#29382e';
  toastEl.classList.add('visible');
  setTimeout(() => {
    toastEl.classList.remove('visible');
  }, 3200);
}

function showMessage(element: HTMLElement, message: string, isError = false) {
  element.textContent = message;
  element.classList.toggle('is-error', isError);
}

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

// Convert HTML datetime-local (YYYY-MM-DDTHH:mm) to ISO with Timezone (e.g. +07:00)
function toIsoWithTimezone(datetimeLocalValue: string): string {
  const date = new Date(datetimeLocalValue);
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const hours = pad(offsetMinutes / 60);
  const minutes = pad(offsetMinutes % 60);

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${hours}:${minutes}`;
}

// ================= Auth & Session =================
function handleSessionExpired() {
  clearSession();
  showLogin('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
}

function clearSession() {
  sessionStorage.removeItem(storageKeys.token);
  sessionStorage.removeItem(storageKeys.userId);
  if (notificationPollTimer !== null) {
    clearInterval(notificationPollTimer);
    notificationPollTimer = null;
  }
}

function setAuthTab(tab: 'login' | 'register') {
  const isLogin = tab === 'login';
  byId<HTMLButtonElement>('login-tab').classList.toggle('active', isLogin);
  byId<HTMLButtonElement>('register-tab').classList.toggle('active', !isLogin);
  byId<HTMLButtonElement>('login-tab').setAttribute('aria-selected', String(isLogin));
  byId<HTMLButtonElement>('register-tab').setAttribute('aria-selected', String(!isLogin));
  loginForm.classList.toggle('hidden', !isLogin);
  registerForm.classList.toggle('hidden', isLogin);
  byId<HTMLElement>('auth-title').textContent = isLogin ? 'ยินดีต้อนรับ' : 'สร้างบัญชีผู้ใช้ใหม่';
  showMessage(authMessage, '');
}

function showLogin(message = '') {
  authView.classList.remove('hidden');
  byId('learning-strip').classList.remove('hidden');
  workspaceView.classList.add('hidden');
  userControls.classList.add('hidden');
  notiDropdown.classList.add('hidden');
  if (message) showMessage(authMessage, message, true);
}

async function showWorkspace() {
  authView.classList.add('hidden');
  byId('learning-strip').classList.add('hidden');
  workspaceView.classList.remove('hidden');
  userControls.classList.remove('hidden');

  // Switch to default tab (Groups)
  switchTab('groups');

  // Load user profile & notifications
  await Promise.all([loadProfile(), loadNotifications()]);

  // Start notification polling every 15 seconds
  if (notificationPollTimer === null) {
    notificationPollTimer = window.setInterval(pollNotifications, 15000);
  }
}

// ================= Navigation Tabs =================
type TabName = 'groups' | 'requests' | 'profile';

function switchTab(tab: TabName) {
  tabGroups.classList.toggle('active', tab === 'groups');
  tabRequests.classList.toggle('active', tab === 'requests');
  tabProfile.classList.toggle('active', tab === 'profile');

  tabGroups.setAttribute('aria-selected', String(tab === 'groups'));
  tabRequests.setAttribute('aria-selected', String(tab === 'requests'));
  tabProfile.setAttribute('aria-selected', String(tab === 'profile'));

  contentGroups.classList.toggle('hidden', tab !== 'groups');
  contentRequests.classList.toggle('hidden', tab !== 'requests');
  contentProfile.classList.toggle('hidden', tab !== 'profile');

  if (tab === 'groups') {
    void loadGroups();
  } else if (tab === 'requests') {
    void loadRequests();
  } else if (tab === 'profile') {
    void loadProfile();
  }
}

// ================= 1. Group Service Functions =================
async function loadGroups(subject = '', openOnly = true) {
  byId('group-result-count').textContent = 'กำลังค้นหา...';
  groupsList.innerHTML = '<div class="loading-state">กำลังโหลดรายการกลุ่มอ่านหนังสือ...</div>';
  try {
    const params = new URLSearchParams();
    if (subject.trim()) params.append('subject', subject.trim());
    if (openOnly) params.append('openOnly', 'true');

    const query = params.toString() ? `?${params.toString()}` : '';
    const groups = await apiRequest<Group[]>(groupUrl, `/api/groups${query}`, { method: 'GET' });

    renderGroups(groups);
  } catch (error) {
    byId("group-result-count").textContent = "โหลดไม่สำเร็จ";
    groupsList.innerHTML = `<div class="empty-state"><p class="required">${(error as Error).message}</p><button class="button button-quiet" onclick="location.reload()">ลองใหม่</button></div>`;
  }
}

function renderGroups(groups: Group[]) {
  byId('group-result-count').textContent = `พบ ${groups.length} กลุ่ม`;
  if (groups.length === 0) {
    groupsList.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <span aria-hidden="true">✳</span>
        <p>ไม่พบกลุ่มอ่านหนังสือในเงื่อนไขนี้</p>
        <small>ลองเปลี่ยนคำค้นหา หรือกดปุ่ม "สร้างกลุ่มอ่านใหม่" ด้านบนเพื่อเปิดกลุ่มของคุณเอง</small>
      </div>`;
    return;
  }

  const myId = currentUserId();

  groupsList.innerHTML = groups
    .map((group, index) => {
      const isOwner = group.ownerId === myId;
      const isMember = group.members.includes(myId ?? '');
      const isFull = group.members.length >= group.maxMembers;
      const isClosed = !group.isOpen;

      let statusBadge = '';
      if (isClosed) {
        statusBadge = '<span class="status-badge closed">ปิดรับแล้ว</span>';
      } else if (isFull) {
        statusBadge = '<span class="status-badge full">ที่นั่งเต็มแล้ว</span>';
      } else {
        statusBadge = '<span class="status-badge open">เปิดรับสมาชิก</span>';
      }

      let actionHtml = '';
      if (isOwner) {
        actionHtml = `
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="badge-owner">กลุ่มของคุณ</span>
            <button class="button button-quiet button-sm" data-action="view-requests" data-group-id="${group.id}">
              ดูคำขอ
            </button>
          </div>`;
      } else if (isMember) {
        actionHtml = '<span class="badge-member">✓ คุณเป็นสมาชิกกลุ่มนี้แล้ว</span>';
      } else if (isClosed || isFull) {
        actionHtml = '<button class="button button-quiet button-sm" disabled>ไม่สามารถเข้าร่วมได้</button>';
      } else {
        actionHtml = `
          <button class="button button-primary button-sm" data-action="join-group" data-group-id="${group.id}">
            ขอเข้าร่วมกลุ่ม (Join) <span aria-hidden="true">↗</span>
          </button>`;
      }

      return `
        <article class="group-card" data-id="${escapeHtml(group.id)}">
          <div class="session-index" aria-hidden="true"><span>SESSION</span><b>${String(index + 1).padStart(2, "0")}</b><span>✳</span></div>
          <div>
            <div class="group-header">
              <span class="subject-badge">${escapeHtml(group.subject)}</span>
              ${statusBadge}
            </div>
            <h3 class="group-topic">${escapeHtml(group.topic)}</h3>
            <div class="group-meta-list">
              <div class="group-meta-item">
                <span aria-hidden="true">◷</span>
                <span>${formatDate(group.startsAt)}</span>
              </div>
              <div class="group-meta-item">
                <span aria-hidden="true">⌖</span>
                <span>${escapeHtml(group.location)}</span>
              </div>
            </div>
            ${group.description ? `<p class="group-desc">${escapeHtml(group.description)}</p>` : ''}
          </div>
          <div class="group-card-footer">
            <span class="seats-counter">◎ ${group.members.length} / ${group.maxMembers} ที่นั่ง</span>
            ${actionHtml}
          </div>
        </article>
      `;
    })
    .join('');

  // Attach event listeners for card actions
  groupsList.querySelectorAll('[data-action="join-group"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const gId = (e.currentTarget as HTMLElement).getAttribute('data-group-id');
      if (gId) void handleJoinGroup(gId);
    });
  });

  groupsList.querySelectorAll('[data-action="view-requests"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchTab('requests');
    });
  });
}

async function handleJoinGroup(groupId: string) {
  try {
    await apiRequest<MembershipRequest>(memberUrl, '/api/requests', {
      method: 'POST',
      body: JSON.stringify({ groupId }),
    });
    showToast('ส่งคำขอเข้าร่วมกลุ่มสำเร็จ! กรุณารอเจ้าของกลุ่มอนุมัติ');
    void loadGroups(groupSearchInput.value, groupSearchOpenOnly.checked);
  } catch (error) {
    showToast((error as Error).message, true);
  }
}

// ================= 2. Membership Service Functions =================
async function loadRequests() {
  ownerGroupsContainer.innerHTML = '<div class="loading-state">กำลังดึงรายการกลุ่มและคำขอของคุณ...</div>';
  try {
    // 1. Fetch all groups to identify groups owned by the current user
    const allGroups = await apiRequest<Group[]>(groupUrl, '/api/groups', { method: 'GET' });
    const myGroups = allGroups.filter((g) => g.ownerId === currentUserId());

    if (myGroups.length === 0) {
      ownerGroupsContainer.innerHTML = `
        <div class="empty-state">
          <span aria-hidden="true">✳</span>
          <p>คุณยังไม่ได้เป็นเจ้าของกลุ่มอ่านหนังสือใด ๆ</p>
          <small>เมื่อคุณสร้างกลุ่มอ่านหนังสือ คำขอจากเพื่อนคนอื่นจะแสดงที่นี่เพื่อให้คุณกดอนุมัติ</small>
        </div>`;
      requestsBadge.classList.add('hidden');
      return;
    }

    // 2. Fetch requests for each owned group
    let totalPending = 0;
    const blocksHtml = await Promise.all(
      myGroups.map(async (group) => {
        try {
          const reqs = await apiRequest<MembershipRequest[]>(
            memberUrl,
            `/api/requests?groupId=${encodeURIComponent(group.id)}`,
            { method: 'GET' },
          );

          const pendingCount = reqs.filter((r) => r.status === 'pending').length;
          totalPending += pendingCount;

          let reqRows = '';
          if (reqs.length === 0) {
            reqRows = '<div class="empty-state-compact">ยังไม่มีคำขอเข้าร่วมสำหรับกลุ่มนี้</div>';
          } else {
            reqRows = reqs
              .map((r) => {
                let statusPill = '';
                let actionButtons = '';

                if (r.status === 'pending') {
                  statusPill = '<span class="status-badge" style="background:#fef3e2; color:#b25e16;">รออนุมัติ</span>';
                  actionButtons = `
                    <div class="request-actions">
                      <button class="button-success button-sm" data-action="approve" data-request-id="${r.id}">อนุมัติ</button>
                      <button class="button-danger button-sm" data-action="reject" data-request-id="${r.id}">ปฏิเสธ</button>
                    </div>`;
                } else if (r.status === 'approved') {
                  statusPill = '<span class="status-badge open">อนุมัติแล้ว</span>';
                } else {
                  statusPill = '<span class="status-badge closed">ปฏิเสธแล้ว</span>';
                }

                return `
                  <div class="request-row">
                    <div class="requester-info">
                      <span class="requester-id">ผู้ขอ: <code>${escapeHtml(r.requesterId)}</code></span>
                      <span class="request-date">ส่งเมื่อ: ${formatDate(r.createdAt)}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:12px;">
                      ${statusPill}
                      ${actionButtons}
                    </div>
                  </div>
                `;
              })
              .join('');
          }

          return `
            <div class="owner-group-box">
              <div class="owner-group-header">
                <div>
                  <span class="subject-badge">${escapeHtml(group.subject)}</span>
                  <div class="owner-group-title" style="margin-top:6px;">${escapeHtml(group.topic)}</div>
                  <small class="muted">สมาชิกปัจจุบัน: ${group.members.length} / ${group.maxMembers} คน</small>
                </div>
                ${group.isOpen ? '<span class="status-badge open">เปิดรับ</span>' : '<span class="status-badge closed">ปิดรับ</span>'}
              </div>
              <div class="requests-table">
                ${reqRows}
              </div>
            </div>
          `;
        } catch (err) {
          return `
            <div class="owner-group-box">
              <div class="owner-group-title">${escapeHtml(group.topic)}</div>
              <p class="required" style="font-size:12px;">ดึงคำขอไม่สำเร็จ: ${(err as Error).message}</p>
            </div>
          `;
        }
      }),
    );

    ownerGroupsContainer.innerHTML = blocksHtml.join('');

    // Update requests badge
    if (totalPending > 0) {
      requestsBadge.textContent = String(totalPending);
      requestsBadge.classList.remove('hidden');
    } else {
      requestsBadge.classList.add('hidden');
    }

    // Attach approve / reject handlers
    ownerGroupsContainer.querySelectorAll('[data-action="approve"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const rId = (e.currentTarget as HTMLElement).getAttribute('data-request-id');
        if (rId) void handleDecision(rId, 'approve');
      });
    });

    ownerGroupsContainer.querySelectorAll('[data-action="reject"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const rId = (e.currentTarget as HTMLElement).getAttribute('data-request-id');
        if (rId) void handleDecision(rId, 'reject');
      });
    });
  } catch (error) {
    ownerGroupsContainer.innerHTML = `<div class="empty-state"><p class="required">${(error as Error).message}</p></div>`;
  }
}

async function handleDecision(requestId: string, action: 'approve' | 'reject') {
  try {
    await apiRequest(memberUrl, `/api/requests/${encodeURIComponent(requestId)}/${action}`, {
      method: 'POST',
    });
    showToast(action === 'approve' ? 'อนุมัติคำขอเรียบร้อยแล้ว!' : 'ปฏิเสธคำขอเรียบร้อย');
    void loadRequests();
  } catch (error) {
    showToast((error as Error).message, true);
  }
}

// ================= 3. Notification Service Functions =================
async function pollNotifications() {
  if (!token()) return;
  try {
    const list = await apiRequest<NotificationItem[]>(notifyUrl, '/api/notifications', { method: 'GET' });
    const unread = list.filter((n) => !n.read).length;
    if (unread > 0) {
      notiBadge.textContent = unread > 99 ? '99+' : String(unread);
      notiBadge.classList.remove('hidden');
      notiUnreadText.textContent = `มีข้อความใหม่ ${unread} รายการ`;
    } else {
      notiBadge.classList.add('hidden');
      notiUnreadText.textContent = 'ไม่มีข้อความใหม่';
    }
  } catch {
    // Silent fail in background polling
  }
}

async function loadNotifications() {
  try {
    const list = await apiRequest<NotificationItem[]>(notifyUrl, '/api/notifications', { method: 'GET' });
    const unread = list.filter((n) => !n.read).length;

    if (unread > 0) {
      notiBadge.textContent = unread > 99 ? '99+' : String(unread);
      notiBadge.classList.remove('hidden');
      notiUnreadText.textContent = `มีข้อความใหม่ ${unread} รายการ`;
    } else {
      notiBadge.classList.add('hidden');
      notiUnreadText.textContent = 'ไม่มีข้อความใหม่';
    }

    if (list.length === 0) {
      notiList.innerHTML = '<div class="empty-state-compact">ไม่มีการแจ้งเตือนในระบบ</div>';
      return;
    }

    notiList.innerHTML = list
      .map((item) => {
        const isApproved = item.type === 'request_approved';
        const badgeType = isApproved
          ? '<span class="noti-badge-type approved">อนุมัติแล้ว</span>'
          : '<span class="noti-badge-type rejected">ไม่ได้รับการอนุมัติ</span>';

        return `
          <div class="noti-item ${item.read ? '' : 'unread'}" data-id="${item.id}">
            <div class="noti-meta">
              ${badgeType}
              <span>${formatDate(item.createdAt)}</span>
            </div>
            <div class="noti-msg">${escapeHtml(item.message)}</div>
            ${
              !item.read
                ? `<button class="noti-mark-read-btn" data-id="${item.id}">✓ ทำเครื่องหมายว่าอ่านแล้ว</button>`
                : ''
            }
          </div>
        `;
      })
      .join('');

    // Mark as read clicks
    notiList.querySelectorAll('.noti-mark-read-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
        if (id) void markNotificationAsRead(id);
      });
    });
  } catch {
    notiList.innerHTML = '<div class="empty-state-compact">ไม่สามารถโหลดการแจ้งเตือนได้</div>';
  }
}

async function markNotificationAsRead(notificationId: string) {
  try {
    await apiRequest(notifyUrl, `/api/notifications/${encodeURIComponent(notificationId)}/read`, {
      method: 'PATCH',
    });
    void loadNotifications();
  } catch (error) {
    showToast((error as Error).message, true);
  }
}

// ================= 4. Profile Service Functions =================
async function loadProfile() {
  const userId = currentUserId();
  if (!userId) return;

  try {
    const profile = await apiRequest<Profile>(profileUrl, `/api/users/${encodeURIComponent(userId)}`, {
      method: 'GET',
    });

    profileName.textContent = profile.name || 'ไม่ระบุ';
    profileEmail.textContent = profile.email || '—';
    profileUserId.textContent = profile.id;
    welcomeName.textContent = profile.name || 'นักเรียน';
    avatarInitial.textContent = (profile.name || 'ส').charAt(0).toUpperCase();

    subjectsInput.value = (profile.subjects || []).join('\n');
  } catch (error) {
    showMessage(profileMessage, (error as Error).message, true);
  }
}

// ================= Security helper =================
function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ================= Event Listeners Wiring =================
function setupEventListeners() {
  const introPanel = document.querySelector<HTMLElement>('.intro-panel');
  if (introPanel && window.matchMedia('(pointer: fine) and (prefers-reduced-motion: no-preference)').matches) {
    introPanel.addEventListener('pointermove', (event) => {
      const bounds = introPanel.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width - 0.5;
      const y = (event.clientY - bounds.top) / bounds.height - 0.5;
      introPanel.style.setProperty('--tilt-x', `${(-y * 3).toFixed(2)}deg`);
      introPanel.style.setProperty('--tilt-y', `${(x * 3).toFixed(2)}deg`);
      introPanel.style.setProperty('--glow-x', `${((x + 0.5) * 100).toFixed(1)}%`);
      introPanel.style.setProperty('--glow-y', `${((y + 0.5) * 100).toFixed(1)}%`);
    });
    introPanel.addEventListener('pointerleave', () => {
      introPanel.style.setProperty('--tilt-x', '0deg');
      introPanel.style.setProperty('--tilt-y', '0deg');
      introPanel.style.setProperty('--glow-x', '50%');
      introPanel.style.setProperty('--glow-y', '50%');
    });
  }

  // Auth Tabs
  byId<HTMLButtonElement>('login-tab').addEventListener('click', () => setAuthTab('login'));
  byId<HTMLButtonElement>('register-tab').addEventListener('click', () => setAuthTab('register'));

  // Login Submit
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = byId<HTMLInputElement>('login-username').value.trim();
    const password = byId<HTMLInputElement>('login-password').value;

    showMessage(authMessage, 'กำลังเข้าสู่ระบบ...');
    try {
      const auth = await apiRequest<AuthResponse>(
        authUrl,
        '/api/login',
        { method: 'POST', body: JSON.stringify({ email, password }) },
        false,
      );

      const accessToken = auth.token ?? auth.accessToken;
      const uId = auth.userId ?? auth.id;

      if (!accessToken || !uId) {
        throw new Error('ไม่พบ token หรือ userId ในคำตอบจาก Auth Service');
      }

      sessionStorage.setItem(storageKeys.token, accessToken);
      sessionStorage.setItem(storageKeys.userId, uId);

      showMessage(authMessage, '');
      showToast('เข้าสู่ระบบสำเร็จ ยินดีต้อนรับ!');
      await showWorkspace();
    } catch (error) {
      showMessage(authMessage, (error as Error).message, true);
    }
  });

  // Register Submit
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = byId<HTMLInputElement>('register-name').value.trim();
    const email = byId<HTMLInputElement>('register-email').value.trim();
    const password = byId<HTMLInputElement>('register-password').value;

    showMessage(authMessage, 'กำลังสร้างบัญชีผู้ใช้และโปรไฟล์...');
    try {
      await apiRequest(
        authUrl,
        '/api/register',
        { method: 'POST', body: JSON.stringify({ name, email, password }) },
        false,
      );

      showToast('สร้างบัญชีสำเร็จ! กำลังเข้าสู่ระบบให้โดยอัตโนมัติ...');
      // Auto login after register
      const loginRes = await apiRequest<AuthResponse>(
        authUrl,
        '/api/login',
        { method: 'POST', body: JSON.stringify({ email, password }) },
        false,
      );

      const accessToken = loginRes.token ?? loginRes.accessToken;
      const uId = loginRes.userId ?? loginRes.id;

      if (accessToken && uId) {
        sessionStorage.setItem(storageKeys.token, accessToken);
        sessionStorage.setItem(storageKeys.userId, uId);
        await showWorkspace();
      } else {
        setAuthTab('login');
        showMessage(authMessage, 'สมัครสำเร็จ กรุณาเข้าสู่ระบบด้วยรหัสผ่านของคุณ');
      }
    } catch (error) {
      showMessage(authMessage, (error as Error).message, true);
    }
  });

  // Logout
  byId<HTMLButtonElement>('logout-button').addEventListener('click', () => {
    clearSession();
    showLogin('ออกจากระบบเรียบร้อย');
    showToast('ออกจากระบบแล้ว');
  });

  // Nav Tabs Switching
  tabGroups.addEventListener('click', () => switchTab('groups'));
  tabRequests.addEventListener('click', () => switchTab('requests'));
  tabProfile.addEventListener('click', () => switchTab('profile'));

  // Notification Toggle & Actions
  notiToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = notiDropdown.classList.contains('hidden');
    notiDropdown.classList.toggle('hidden', !isHidden);
    if (isHidden) {
      void loadNotifications();
    }
  });

  notiCloseBtn.addEventListener('click', () => {
    notiDropdown.classList.add('hidden');
  });

  notiRefreshBtn.addEventListener('click', () => {
    void loadNotifications();
  });

  document.addEventListener('click', (e) => {
    if (!notiDropdown.contains(e.target as Node) && !notiToggleBtn.contains(e.target as Node)) {
      notiDropdown.classList.add('hidden');
    }
  });

  // Group Filters
  groupSearchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    void loadGroups(groupSearchInput.value, groupSearchOpenOnly.checked);
  });

  groupResetBtn.addEventListener('click', () => {
    groupSearchInput.value = '';
    groupSearchOpenOnly.checked = true;
    void loadGroups('', true);
  });

  // Create Group Modal Handlers
  openCreateGroupBtn.addEventListener('click', () => {
    // Default to tomorrow 10:00
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    groupStartsAtInput.value = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(
      tomorrow.getDate(),
    )}T${pad(tomorrow.getHours())}:${pad(tomorrow.getMinutes())}`;

    // Set min datetime to now
    const now = new Date();
    groupStartsAtInput.min = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
      now.getDate(),
    )}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

    createGroupModal.classList.remove('hidden');
  });

  closeCreateGroupModalBtn.addEventListener('click', () => createGroupModal.classList.add('hidden'));
  cancelCreateGroupBtn.addEventListener('click', () => createGroupModal.classList.add('hidden'));

  createGroupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const subject = byId<HTMLInputElement>('group-subject').value.trim();
    const topic = byId<HTMLInputElement>('group-topic').value.trim();
    const startsAtRaw = groupStartsAtInput.value;
    const maxMembers = parseInt(byId<HTMLInputElement>('group-max-members').value, 10);
    const location = byId<HTMLInputElement>('group-location').value.trim();
    const description = byId<HTMLTextAreaElement>('group-description').value.trim();

    if (!subject || !topic || !startsAtRaw || !location || isNaN(maxMembers) || maxMembers <= 0) {
      showToast('กรุณากรอกข้อมูลให้ครบถ้วนและถูกต้อง', true);
      return;
    }

    try {
      const isoStartsAt = toIsoWithTimezone(startsAtRaw);

      await apiRequest<Group>(groupUrl, '/api/groups', {
        method: 'POST',
        body: JSON.stringify({
          subject,
          topic,
          startsAt: isoStartsAt,
          maxMembers,
          location,
          description: description || undefined,
          isOpen: true,
        }),
      });

      createGroupModal.classList.add('hidden');
      createGroupForm.reset();
      showToast('สร้างกลุ่มอ่านหนังสือสำเร็จแล้ว!');
      void loadGroups(groupSearchInput.value, groupSearchOpenOnly.checked);
    } catch (error) {
      showToast((error as Error).message, true);
    }
  });

  // Requests Refresh
  refreshRequestsBtn.addEventListener('click', () => {
    void loadRequests();
  });

  // Subjects Save
  subjectsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId = currentUserId();
    if (!userId) return;

    const subjects = subjectsInput.value
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    showMessage(profileMessage, 'กำลังบันทึกรายวิชา...');
    try {
      await apiRequest(profileUrl, `/api/users/${encodeURIComponent(userId)}`, {
        method: 'PUT',
        body: JSON.stringify({ subjects }),
      });
      showMessage(profileMessage, 'บันทึกรายวิชาเรียบร้อยแล้ว!');
      showToast('บันทึกวิชาที่สนใจสำเร็จ');
    } catch (error) {
      showMessage(profileMessage, (error as Error).message, true);
    }
  });

  // Classmates Search
  classmatesSearchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = classmatesSubjectInput.value.trim();
    if (!query) return;

    classmatesResults.innerHTML = '<div class="loading-state">กำลังค้นหาเพื่อนที่สนใจวิชานี้...</div>';
    try {
      const results = await apiRequest<Classmate[]>(
        profileUrl,
        `/api/users/search?subject=${encodeURIComponent(query)}`,
        { method: 'GET' },
      );

      if (results.length === 0) {
        classmatesResults.innerHTML = `
          <div class="empty-state">
            <span aria-hidden="true">⌕</span>
            <p>ยังไม่มีเพื่อนลงทะเบียนวิชา "${escapeHtml(query)}"</p>
            <small>ลองชวนเพื่อนมาสมัคร หรือลองค้นหาวิชาอื่น</small>
          </div>`;
        return;
      }

      classmatesResults.innerHTML = `
        <div class="results-count">พบเพื่อนที่สนใจวิชานี้ ${results.length} คน</div>
        ${results
          .map(
            (c) => `
          <div class="person-card">
            <span class="avatar avatar-small">${escapeHtml(c.name.charAt(0).toUpperCase())}</span>
            <div class="person-info">
              <strong>${escapeHtml(c.name)}</strong>
              <span>วิชาที่ลง: ${c.subjects.map(escapeHtml).join(', ')}</span>
            </div>
          </div>
        `,
          )
          .join('')}
      `;
    } catch (error) {
      classmatesResults.innerHTML = `<p class="required" style="font-size:12px; padding:10px;">${(error as Error).message}</p>`;
    }
  });
}

// ================= Initialize =================
async function init() {
  setupEventListeners();

  if (token() && currentUserId()) {
    try {
      await showWorkspace();
    } catch {
      handleSessionExpired();
    }
  } else {
    showLogin();
  }
}

void init();
