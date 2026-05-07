(function () {
  const seedEvents = window.BLUE_MOON_EVENTS || [];
  const eventFeed = document.querySelector("#event-feed");
  const completedCard = document.querySelector("#completed-card");
  const eventForm = document.querySelector("#event-form");
  const orgForm = document.querySelector("#org-form");
  const waitlistForm = document.querySelector("#waitlist-form");
  const pendingEvents = document.querySelector("#pending-events");
  const orgList = document.querySelector("#organization-list");
  const postMode = document.querySelector("#post-mode");
  const orgField = document.querySelector("#organization-field");
  const orgSelect = document.querySelector("#organization-select");

  const categoryImages = {
    "Beach cleanup": {
      imageUrl: "https://images.unsplash.com/photo-1751646312140-42e2dd2b2b23?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=70&w=1800",
      imageAlt: "Volunteers sorting trash collected during a beach cleanup."
    },
    "Park cleanup": {
      imageUrl: "https://images.unsplash.com/photo-1758599668429-121d54188b9c?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=70&w=1800",
      imageAlt: "Volunteers cleaning a park with blue trash bags."
    },
    "Food help": {
      imageUrl: "https://images.unsplash.com/photo-1593113598332-cd288d649433?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=70&w=1800",
      imageAlt: "Volunteers carrying boxes for food distribution."
    },
    "Community garden": {
      imageUrl: "https://images.unsplash.com/photo-1665395131429-e1ee267da39a?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=70&w=1800",
      imageAlt: "A volunteer gardening in a sunny green space."
    }
  };

  const fallbackImage = {
    imageUrl: "https://images.unsplash.com/photo-1652971876875-05db98fab376?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=70&w=1800",
    imageAlt: "Volunteers working together near a wetland."
  };

  const storage = {
    submissions: "blueMoonEventSubmissions",
    organizations: "blueMoonOrganizations",
    waitlist: "blueMoonWaitlist",
    joins: "blueMoonJoins"
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

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function localJoinCount(eventId) {
    return readStored(storage.joins).filter((join) => join.eventId === eventId).length;
  }

  function slugify(value) {
    return String(value)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "activity";
  }

  function formatDateLabel(value) {
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return "Date to be confirmed";
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric"
    }).format(date);
  }

  function submissionId(submission, index) {
    if (submission.id) return submission.id;
    const created = Date.parse(submission.createdAt || "");
    const suffix = Number.isNaN(created) ? index : created;
    return `local-${slugify(submission.title)}-${suffix}`;
  }

  function submissionToEvent(submission, index) {
    const image = categoryImages[submission.category] || fallbackImage;
    return {
      id: submissionId(submission, index),
      title: submission.title,
      category: submission.category || "Community help",
      status: "published",
      locationName: submission.location || "Location to be confirmed",
      dateLabel: formatDateLabel(submission.date),
      timeLabel: "Time to be confirmed",
      dateTime: submission.date ? `${submission.date}T12:00:00` : submission.createdAt,
      organizer: submission.organizer || submission.organizationName || "Local organizer",
      organizerRole: submission.organizerRole || "One-off host",
      participantCount: 0,
      maxParticipants: null,
      imageUrl: image.imageUrl,
      imageAlt: image.imageAlt,
      summary: submission.description || "A community-posted activity on Blue Moon.",
      description: submission.description || "Details are still being filled in by the organizer.",
      bring: "Check with the organizer for final details before you go.",
      source: submission.source || "one-off"
    };
  }

  function approvedOrganizations() {
    return readStored(storage.organizations).filter((organization) => organization.status === "approved");
  }

  function localSubmissionEvents() {
    return readStored(storage.submissions).map(submissionToEvent);
  }

  function browsableEvents() {
    return [
      ...seedEvents.filter((event) => event.status === "published"),
      ...localSubmissionEvents()
    ];
  }

  function eventHref(event) {
    return `event.html?id=${encodeURIComponent(event.id)}`;
  }

  function renderEventCards() {
    const published = browsableEvents();
    eventFeed.innerHTML = published
      .map((event) => {
        const count = event.participantCount + localJoinCount(event.id);
        return `
          <article class="event-card">
            <a class="event-image-link" href="${eventHref(event)}" aria-label="Open ${escapeHtml(event.title)}">
              <img src="${escapeHtml(event.imageUrl)}" alt="${escapeHtml(event.imageAlt)}" loading="lazy">
            </a>
            <div class="event-card-body">
              <div class="card-meta">
                <span>${escapeHtml(event.category)}</span>
                ${event.source === "org" ? "<span>Approved org</span>" : ""}
                ${event.source === "one-off" ? "<span>One-off post</span>" : ""}
                <span>${count} joining</span>
              </div>
              <h3><a href="${eventHref(event)}">${escapeHtml(event.title)}</a></h3>
              <p>${escapeHtml(event.summary)}</p>
              <dl class="event-facts">
                <div>
                  <dt>Date</dt>
                  <dd>${escapeHtml(event.dateLabel)}</dd>
                </div>
                <div>
                  <dt>Place</dt>
                  <dd>${escapeHtml(event.locationName)}</dd>
                </div>
              </dl>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderCompletedCard() {
    const completed = seedEvents.find((event) => event.status === "completed");
    if (!completed) return;

    completedCard.innerHTML = `
      <img src="${escapeHtml(completed.imageUrl)}" alt="${escapeHtml(completed.imageAlt)}" loading="lazy">
      <div class="proof-card-body">
        <div class="card-meta">
          <span>${escapeHtml(completed.category)}</span>
          <span>Proof posted</span>
        </div>
        <h3>${escapeHtml(completed.title)}</h3>
        <p class="impact-line">${escapeHtml(completed.impactMetric)}</p>
        <p>${escapeHtml(completed.proofSummary)}</p>
        <a class="button light-outline" href="${eventHref(completed)}">View share page</a>
      </div>
    `;
  }

  function renderLocalPosts() {
    const submissions = readStored(storage.submissions);
    pendingEvents.textContent = "";

    if (!submissions.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No local posts yet.";
      pendingEvents.append(empty);
      return;
    }

    const list = document.createElement("div");
    list.className = "pending-stack";
    submissions.slice().reverse().forEach((submission, reverseIndex) => {
      const index = submissions.length - 1 - reverseIndex;
      const localEvent = submissionToEvent(submission, index);
      const item = document.createElement("article");
      item.className = "pending-item";

      const title = document.createElement("strong");
      title.textContent = submission.title;

      const detail = document.createElement("span");
      const sourceLabel = submission.source === "org" ? "approved org post" : "one-off post";
      detail.textContent = `${submission.category} · ${submission.location} · ${sourceLabel} · live in browse`;

      const link = document.createElement("a");
      link.href = eventHref(localEvent);
      link.textContent = "Open activity";

      item.append(title, detail, link);
      list.append(item);
    });
    pendingEvents.append(list);
  }

  function updateOrgPostControls() {
    if (!postMode || !orgField || !orgSelect) return;
    const isOrgPost = postMode.value === "organization";
    orgField.hidden = !isOrgPost;
    orgSelect.disabled = !isOrgPost;
  }

  function renderOrganizationOptions() {
    if (!orgSelect) return;
    const approved = approvedOrganizations();
    orgSelect.textContent = "";

    if (!approved.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No approved organizations yet";
      orgSelect.append(option);
      return;
    }

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Choose approved organization";
    orgSelect.append(placeholder);

    approved.forEach((organization) => {
      const option = document.createElement("option");
      option.value = organization.id;
      option.textContent = organization.name;
      orgSelect.append(option);
    });
  }

  function renderOrganizations() {
    if (!orgList) return;
    const organizations = readStored(storage.organizations);
    orgList.textContent = "";

    if (!organizations.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No organizations created yet.";
      orgList.append(empty);
      renderOrganizationOptions();
      updateOrgPostControls();
      return;
    }

    const list = document.createElement("div");
    list.className = "pending-stack";
    organizations.slice().reverse().forEach((organization) => {
      const item = document.createElement("article");
      item.className = "pending-item";

      const title = document.createElement("strong");
      title.textContent = organization.name;

      const detail = document.createElement("span");
      detail.textContent = organization.status === "approved"
        ? `${organization.contactName} · approved · can post as an org`
        : `${organization.contactName} · pending approval`;

      item.append(title, detail);

      if (organization.status !== "approved") {
        const button = document.createElement("button");
        button.className = "text-button";
        button.type = "button";
        button.textContent = "Approve org";
        button.addEventListener("click", () => {
          const updated = readStored(storage.organizations).map((candidate) => {
            if (candidate.id !== organization.id) return candidate;
            return {
              ...candidate,
              status: "approved",
              approvedAt: new Date().toISOString()
            };
          });
          writeStored(storage.organizations, updated);
          renderOrganizations();
          setNote("#org-form-note", `${organization.name} is approved and can now post activities.`);
        });
        item.append(button);
      }

      list.append(item);
    });
    orgList.append(list);
    renderOrganizationOptions();
    updateOrgPostControls();
  }

  function setNote(id, message) {
    const note = document.querySelector(id);
    if (note) note.textContent = message;
  }

  if (eventForm) {
    eventForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(eventForm).entries());
      const isOrgPost = data.postMode === "organization";
      const organization = isOrgPost
        ? approvedOrganizations().find((candidate) => candidate.id === data.organizationId)
        : null;

      if (isOrgPost && !organization) {
        setNote("#event-form-note", "Create and approve an organization before posting as one. One-off posts do not need approval.");
        return;
      }

      const submissions = readStored(storage.submissions);
      submissions.push({
        ...data,
        source: isOrgPost ? "org" : "one-off",
        organizationId: organization ? organization.id : "",
        organizationName: organization ? organization.name : "",
        organizer: isOrgPost ? organization.name : data.organizer,
        organizerRole: isOrgPost ? "Approved organization" : "One-off host",
        id: `local-${slugify(data.title)}-${Date.now()}`,
        createdAt: new Date().toISOString()
      });
      writeStored(storage.submissions, submissions);
      eventForm.reset();
      updateOrgPostControls();
      renderEventCards();
      renderLocalPosts();
      setNote("#event-form-note", isOrgPost
        ? "Posted under the approved organization. People can browse and join it now."
        : "Posted as a one-off activity. People can browse and join it now.");
    });
  }

  if (orgForm) {
    orgForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(orgForm).entries());
      const organizations = readStored(storage.organizations);
      organizations.push({
        ...data,
        id: `org-${slugify(data.name)}-${Date.now()}`,
        status: "pending_review",
        createdAt: new Date().toISOString()
      });
      writeStored(storage.organizations, organizations);
      orgForm.reset();
      renderOrganizations();
      setNote("#org-form-note", "Organization created. It is pending approval in this prototype.");
    });
  }

  if (postMode) {
    postMode.addEventListener("change", updateOrgPostControls);
  }

  if (waitlistForm) {
    waitlistForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(waitlistForm).entries());
      const waitlist = readStored(storage.waitlist);
      waitlist.push({
        ...data,
        createdAt: new Date().toISOString()
      });
      writeStored(storage.waitlist, waitlist);
      waitlistForm.reset();
      setNote("#waitlist-form-note", "You are on the early access list in this prototype.");
    });
  }

  renderEventCards();
  renderCompletedCard();
  renderLocalPosts();
  renderOrganizations();
})();
