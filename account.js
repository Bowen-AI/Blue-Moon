(function () {
  const storage = {
    accounts: "blueMoonAccounts",
    session: "blueMoonSession"
  };

  function readStored(key) {
    try {
      return JSON.parse(localStorage.getItem(key)) || [];
    } catch (error) {
      return [];
    }
  }

  function writeStored(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function publicAccount(account) {
    if (!account) return null;
    return {
      id: account.id,
      name: account.name,
      email: account.email,
      createdAt: account.createdAt
    };
  }

  function randomSalt() {
    const values = new Uint8Array(16);
    crypto.getRandomValues(values);
    return Array.from(values).map((value) => value.toString(16).padStart(2, "0")).join("");
  }

  function toHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  }

  async function hashPassword(password, salt) {
    const input = `${salt}:${password}`;
    if (!crypto.subtle) return `demo:${btoa(input)}`;
    const bytes = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return toHex(digest);
  }

  function accounts() {
    return readStored(storage.accounts);
  }

  function findAccount(email) {
    return accounts().find((account) => account.email === normalizeEmail(email)) || null;
  }

  function setSession(account) {
    localStorage.setItem(storage.session, JSON.stringify({
      email: account.email,
      signedInAt: new Date().toISOString()
    }));
  }

  function current() {
    try {
      const session = JSON.parse(localStorage.getItem(storage.session)) || {};
      return publicAccount(findAccount(session.email));
    } catch (error) {
      return null;
    }
  }

  function allAccounts() {
    return accounts().map(publicAccount);
  }

  async function createAccount({ name, email, password }) {
    const normalizedEmail = normalizeEmail(email);
    if (!name || !normalizedEmail || !password) {
      throw new Error("Add a name, email, and password.");
    }
    if (findAccount(normalizedEmail)) {
      throw new Error("An account already exists for that email. Sign in instead.");
    }

    const salt = randomSalt();
    const account = {
      id: `acct-${Date.now()}`,
      name: String(name).trim(),
      email: normalizedEmail,
      salt,
      passwordHash: await hashPassword(password, salt),
      createdAt: new Date().toISOString()
    };
    writeStored(storage.accounts, [...accounts(), account]);
    setSession(account);
    return publicAccount(account);
  }

  async function signIn({ email, password }) {
    const account = findAccount(email);
    if (!account) throw new Error("No account found for that email.");
    const nextHash = await hashPassword(password, account.salt);
    if (nextHash !== account.passwordHash) throw new Error("That password does not match.");
    setSession(account);
    return publicAccount(account);
  }

  function signOut() {
    localStorage.removeItem(storage.session);
  }

  window.BLUE_MOON_ACCOUNT = {
    allAccounts,
    createAccount,
    current,
    normalizeEmail,
    signIn,
    signOut
  };
})();
