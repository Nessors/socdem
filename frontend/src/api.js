export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, options = {}) {
  const headers = { ...options.headers };
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (!isForm && options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(path, {
    credentials: "include",
    ...options,
    headers,
  });
  if (res.status === 204) {
    return null;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 403 && data.must_change) {
      window.dispatchEvent(new Event("socdem-must-change"));
    } else if (
      res.status === 401 &&
      path !== "/api/auth/me" &&
      path !== "/api/auth/login" &&
      path !== "/api/auth/password"
    ) {
      window.dispatchEvent(new Event("socdem-auth-lost"));
    }
    throw new ApiError(data.error || `Ошибка: ${path}`, res.status);
  }
  return data;
}

export function photoUrl(studentId, slot) {
  return `/api/students/${studentId}/photos/${slot}?t=2`;
}

export function exportDocxUrl(studentId) {
  return `/api/students/${studentId}/export.docx`;
}

export const api = {
  me: () => request("/api/auth/me"),
  login: (username, password) =>
    request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  changePassword: (current_password, new_password, confirm_password) =>
    request("/api/auth/password", {
      method: "POST",
      body: JSON.stringify({
        current_password,
        new_password,
        confirm_password,
      }),
    }),
  shutdown: () => request("/api/shutdown", { method: "POST" }),
  sections: () => request("/api/sections"),
  stream: () => request("/api/stream"),
  faculty: () => request("/api/faculty"),
  groups: () => request("/api/groups"),
  students: () => request("/api/students"),
  placeCatalog: (params) => {
    const q = new URLSearchParams();
    if (params?.kind) q.set("kind", params.kind);
    if (params?.q) q.set("q", params.q);
    const suffix = q.toString() ? `?${q}` : "";
    return request(`/api/place-catalog${suffix}`);
  },
  dashboard: () => request("/api/dashboard"),
  relatives: () => request("/api/relatives"),
  geography: () => request("/api/geography"),
  mourning: () => request("/api/mourning"),
  discipline: () => request("/api/discipline"),
  createDiscipline: (body) =>
    request("/api/discipline", { method: "POST", body: JSON.stringify(body) }),
  deleteDiscipline: (id) => request(`/api/discipline/${id}`, { method: "DELETE" }),
  student: (id) => request(`/api/students/${id}`),
  createRecord: (studentId, kind, body) =>
    request(`/api/students/${studentId}/${kind}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateRecord: (studentId, kind, itemId, body) =>
    request(`/api/students/${studentId}/${kind}/${itemId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteRecord: (studentId, kind, itemId) =>
    request(`/api/students/${studentId}/${kind}/${itemId}`, {
      method: "DELETE",
    }),
  createStudent: (body) =>
    request("/api/students", { method: "POST", body: JSON.stringify(body) }),
  updateStudent: (id, body) =>
    request(`/api/students/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteStudent: (id) => request(`/api/students/${id}`, { method: "DELETE" }),
  bulkStudents: (students) =>
    request("/api/students/bulk", {
      method: "POST",
      body: JSON.stringify({ students }),
    }),
  uploadPhoto: async (studentId, slot, file) => {
    const form = new FormData();
    form.append("photo", file);
    const res = await fetch(`/api/students/${studentId}/photos/${slot}`, {
      method: "POST",
      body: form,
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) window.dispatchEvent(new Event("socdem-auth-lost"));
      throw new ApiError(data.error || "Не удалось загрузить фото", res.status);
    }
    return data;
  },
  deletePhoto: (studentId, slot) =>
    request(`/api/students/${studentId}/photos/${slot}`, { method: "DELETE" }),
  importStudentDocx: async (studentId, file) => {
    const form = new FormData();
    form.append("docx", file);
    const res = await fetch(`/api/students/${studentId}/import.docx`, {
      method: "POST",
      body: form,
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) window.dispatchEvent(new Event("socdem-auth-lost"));
      throw new ApiError(data.error || "Не удалось импортировать .docx", res.status);
    }
    return data;
  },
  /** groupId не обязателен — сервер определит группу по специальности и году набора */
  importNewStudentDocx: async (file, { groupId, category } = {}) => {
    const form = new FormData();
    form.append("docx", file);
    if (groupId != null && groupId !== "") form.append("group_id", String(groupId));
    if (category && category !== "cadet") form.append("category", category);
    const res = await fetch("/api/students/import.docx", {
      method: "POST",
      body: form,
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) window.dispatchEvent(new Event("socdem-auth-lost"));
      const err = new ApiError(data.error || "Не удалось импортировать .docx", res.status);
      err.payload = data;
      throw err;
    }
    return data;
  },
};
