"use strict";

const apiInput = document.querySelector("#api-url");
const tokenInput = document.querySelector("#token");
const loadButton = document.querySelector("#load");
const listElement = document.querySelector("#notifications");
const statusElement = document.querySelector("#status");
const countElement = document.querySelector("#count");
const loadMoreButton = document.querySelector("#load-more");
let revision = 0;
let loadRevision = 0;
let offset = 0;
let hasMore = false;
apiInput.value = window.location.origin === "null" ? "" : window.location.origin;

function status(message, error = false) {
  statusElement.textContent = message;
  statusElement.className = error ? "error" : "";
}

function reset() {
  revision += 1;
  loadRevision += 1;
  listElement.replaceChildren();
  countElement.textContent = "0 รายการ";
  loadButton.disabled = false;
  loadMoreButton.classList.add("hidden");
  status("เชื่อมต่อบัญชีเพื่อโหลดรายการ");
}

apiInput.addEventListener("input", reset);
tokenInput.addEventListener("input", reset);
document.querySelector("#clear").addEventListener("click", () => {
  tokenInput.value = "";
  reset();
  tokenInput.focus();
});

function connection() {
  const url = new URL(apiInput.value.trim());
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("กรุณาระบุ API URL แบบ http หรือ https ที่ไม่มีข้อมูลบัญชีหรือ query");
  }
  const token = tokenInput.value.trim().replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("กรุณาใส่ access token จากการเข้าสู่ระบบ");
  return { url: url.toString().replace(/\/+$/, ""), token };
}

async function request(config, path, method = "GET") {
  const response = await fetch(`${config.url}${path}`, {
    method, headers: { Authorization: `Bearer ${config.token}` }, cache: "no-store", signal: AbortSignal.timeout(10000),
  });
  if (response.status === 401) throw new Error("Token ใช้ไม่ได้หรือหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง");
  if (response.status === 403) throw new Error("คุณไม่มีสิทธิ์เปลี่ยนการแจ้งเตือนรายการนี้");
  if (!response.ok) throw new Error(`ทำรายการไม่สำเร็จ (${response.status}) กรุณาลองใหม่`);
  return response.json();
}

function render(items, config, currentRevision, unreadCount, append = false) {
  if (!append) listElement.replaceChildren();
  const displayedCount = append ? offset + items.length : items.length;
  countElement.textContent = `${displayedCount} รายการ · ยังไม่อ่าน ${unreadCount}`;
  status(displayedCount ? "เรียงจากรายการล่าสุด" : "ยังไม่มีการแจ้งเตือน");
  for (const item of items) {
    const row = document.createElement("li");
    row.className = `notification${item.read ? " read" : ""}`;
    const content = document.createElement("div");
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = item.type === "request_approved" ? "คำขอได้รับอนุมัติ" : "คำขอถูกปฏิเสธ";
    const message = document.createElement("p");
    message.textContent = item.message;
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${new Date(item.createdAt).toLocaleString("th-TH")} · คำขอ ${item.relatedId}`;
    content.append(badge, message, meta);
    row.append(content);
    if (item.read) {
      const label = document.createElement("span");
      label.className = "read-label";
      label.textContent = "อ่านแล้ว";
      row.append(label);
    } else {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary";
      button.textContent = "ทำเครื่องหมายว่าอ่านแล้ว";
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await request(config, `/api/notifications/${encodeURIComponent(item.id)}/read`, "PATCH");
          if (revision === currentRevision) await load();
        } catch (error) {
          if (revision === currentRevision) status(error instanceof TypeError ? "เชื่อมต่อ service ไม่สำเร็จ กรุณาตรวจสอบ API URL" : error.message, true);
          button.disabled = false;
        }
      });
      row.append(button);
    }
    listElement.append(row);
  }
}

async function load() {
  const currentRevision = revision;
  const currentLoad = ++loadRevision;
  loadButton.disabled = true;
  listElement.replaceChildren();
  countElement.textContent = "0 รายการ";
  status("กำลังโหลดการแจ้งเตือน...");
  try {
    const config = connection();
    offset = 0;
    hasMore = false;
    const page = await request(config, "/api/notifications?limit=20&offset=0");
    if (!page || !Array.isArray(page.items)) throw new Error("ข้อมูลจาก service ไม่อยู่ในรูปแบบรายการแจ้งเตือน");
    if (revision === currentRevision && loadRevision === currentLoad) {
      offset = page.items.length;
      hasMore = page.hasMore;
      loadMoreButton.classList.toggle("hidden", !hasMore);
      render(page.items, config, currentRevision, page.unreadCount);
    }
  } catch (error) {
    if (revision === currentRevision && loadRevision === currentLoad) status(error instanceof TypeError ? "เชื่อมต่อ service ไม่สำเร็จ กรุณาตรวจสอบ API URL" : error.message, true);
  } finally {
    if (revision === currentRevision && loadRevision === currentLoad) loadButton.disabled = false;
  }
}

async function loadMore() {
  if (!hasMore || loadMoreButton.disabled) return;
  const currentRevision = revision;
  loadMoreButton.disabled = true;
  try {
    const config = connection();
    const page = await request(config, `/api/notifications?limit=20&offset=${offset}`);
    if (!page || !Array.isArray(page.items)) throw new Error("ข้อมูลจาก service ไม่อยู่ในรูปแบบรายการแจ้งเตือน");
    if (revision === currentRevision) {
      offset = page.nextOffset ?? offset;
      hasMore = page.hasMore;
      render(page.items, config, currentRevision, page.unreadCount, true);
      loadMoreButton.classList.toggle("hidden", !hasMore);
    }
  } catch (error) {
    if (revision === currentRevision) status(error instanceof TypeError ? "เชื่อมต่อ service ไม่สำเร็จ กรุณาตรวจสอบ API URL" : error.message, true);
  } finally {
    loadMoreButton.disabled = false;
  }
}

loadMoreButton.addEventListener("click", () => void loadMore());

document.querySelector("#connection-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void load();
});
