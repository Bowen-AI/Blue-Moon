(function () {
  const page = document.querySelector("#member-page");

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function memberIdFromLocation() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id") || "";
  }

  function activityItem(event, label) {
    return `
      <article class="dashboard-item">
        <a href="${window.BLUE_MOON_MEMBERS.eventHref(event)}">${escapeHtml(event.title)}</a>
        <span>${escapeHtml(label)} · ${escapeHtml(event.dateLabel)} · ${escapeHtml(event.locationName)}</span>
        <span>${escapeHtml(event.category)}${event.status === "completed" ? " · completed" : ""}</span>
      </article>
    `;
  }

  function renderActivityList(title, items) {
    return `
      <section class="dashboard-card">
        <h3>${escapeHtml(title)}</h3>
        <div class="dashboard-list">
          ${items || '<p class="empty-state">Nothing here yet.</p>'}
        </div>
      </section>
    `;
  }

  function profileRoleLabel(sources) {
    const labels = [];
    if (sources.includes("account")) labels.push("Blue Moon member");
    if (sources.includes("joined")) labels.push("participant");
    if (sources.includes("organizer")) labels.push("organizer");
    return labels.length ? labels.join(" · ") : "Blue Moon member";
  }

  function renderGoodTypeCloud(goodTypes) {
    if (!goodTypes.length) return "";
    return `
      <div class="good-type-cloud" aria-label="Types of good and event counts">
        ${goodTypes.map((type) => `
          <span class="good-type-bubble">
            <strong>${escapeHtml(type.category)}</strong>
            <span>${type.count} ${type.count === 1 ? "event" : "events"}</span>
          </span>
        `).join("")}
      </div>
    `;
  }

  function renderNotFound() {
    page.innerHTML = `
      <section class="section not-found">
        <p class="eyebrow dark">Member not found</p>
        <h1>This Blue Moon member page does not exist yet.</h1>
        <a class="button primary" href="index.html#account">Look up members</a>
      </section>
    `;
  }

  function renderProfile(profile) {
    document.title = `${profile.name} | Blue Moon`;
    const joinedMarkup = profile.joined.map(({ event }) => activityItem(event, "Joined")).join("");
    const organizedMarkup = profile.organized.map((event) => activityItem(event, "Organized")).join("");
    const roleLabel = profileRoleLabel(profile.sources);
    page.innerHTML = `
      <section class="section member-profile-hero">
        <p class="eyebrow dark">Member profile</p>
        <h1>${escapeHtml(profile.name)}</h1>
        <p>${escapeHtml(roleLabel)}</p>
        <div class="metric-row profile-metrics" aria-label="Community activity">
          <span><strong>${profile.stats.joinedCount}</strong> events joined</span>
          <span><strong>${profile.stats.organizedCount}</strong> events organized</span>
          <span><strong>${profile.stats.completedCount}</strong> completed actions</span>
        </div>
        ${renderGoodTypeCloud(profile.goodTypes)}
      </section>
      <section class="section member-profile-grid">
        ${renderActivityList("Service Joined", joinedMarkup)}
        ${renderActivityList("Service Organized", organizedMarkup)}
      </section>
    `;
  }

  const id = memberIdFromLocation();
  const email = window.BLUE_MOON_MEMBERS.emailFromMemberId(id);
  const profile = email ? window.BLUE_MOON_MEMBERS.profileForEmail(email) : null;
  const hasActivity = profile && (profile.sources.length || profile.joined.length || profile.organized.length);
  if (!profile || !profile.email || !hasActivity) {
    renderNotFound();
  } else {
    renderProfile(profile);
  }
})();
