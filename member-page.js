(function () {
  const page = document.querySelector("#member-page");
  const site = window.BLUE_MOON_SITE || {
    name: "Blue Moon",
    searchName: "Blue Moon Beige",
    alternateNames: ["Blue Moon Beige", "BlueMoon Beige", "bluemoon beige"],
    url: "https://bluemoonbeige.vercel.app",
    description: "Blue Moon Beige helps people find, create, join, and share local Blue Moon events for doing good.",
    image: ""
  };

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
    const fromQuery = params.get("id");
    if (fromQuery) return fromQuery;
    const match = window.location.pathname.match(/\/members\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : "";
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

  function setMeta(attribute, key, content) {
    let meta = document.head.querySelector(`meta[${attribute}="${key}"]`);
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute(attribute, key);
      document.head.append(meta);
    }
    meta.setAttribute("content", content);
  }

  function setCanonical(href) {
    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.append(canonical);
    }
    canonical.href = href;
  }

  function injectJsonLd(id, data) {
    let script = document.querySelector(`#${id}`);
    if (!script) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.id = id;
      document.head.append(script);
    }
    script.textContent = JSON.stringify(data);
  }

  function profileUrl(profile) {
    return `${site.url.replace(/\/$/, "")}/members/${encodeURIComponent(profile.id)}`;
  }

  function setProfileMetadata(profile, roleLabel) {
    const siteName = site.searchName || site.name || "Blue Moon";
    const title = `${profile.name} | ${siteName}`;
    const description = `${profile.name} has joined ${profile.stats.joinedCount} events, organized ${profile.stats.organizedCount} events, and completed ${profile.stats.completedCount} good actions on ${siteName}.`;
    const url = profileUrl(profile);
    document.title = title;
    setCanonical(url);
    setMeta("name", "description", description);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", url);
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);
    injectJsonLd("blue-moon-profile-structured-data", {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      url,
      name: title,
      description,
      mainEntity: {
        "@type": "Person",
        name: profile.name,
        description: roleLabel,
        interactionStatistic: [
          {
            "@type": "InteractionCounter",
            interactionType: "https://schema.org/JoinAction",
            userInteractionCount: profile.stats.joinedCount
          },
          {
            "@type": "InteractionCounter",
            interactionType: "https://schema.org/OrganizeAction",
            userInteractionCount: profile.stats.organizedCount
          }
        ]
      }
    });
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
        <a class="button primary" href="/#account">Look up members</a>
      </section>
    `;
  }

  function renderProfile(profile) {
    const joinedMarkup = profile.joined.map(({ event }) => activityItem(event, "Joined")).join("");
    const organizedMarkup = profile.organized.map((event) => activityItem(event, "Organized")).join("");
    const roleLabel = profileRoleLabel(profile.sources);
    setProfileMetadata(profile, roleLabel);
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
