(function () {
  const seedEvents = window.BLUE_MOON_EVENTS || [];
  const page = document.querySelector("#event-page");
  const joinsStorageKey = "blueMoonJoins";
  const submissionsStorageKey = "blueMoonEventSubmissions";

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

  function readJoins() {
    try {
      return JSON.parse(localStorage.getItem(joinsStorageKey)) || [];
    } catch (error) {
      return [];
    }
  }

  function readSubmissions() {
    try {
      return JSON.parse(localStorage.getItem(submissionsStorageKey)) || [];
    } catch (error) {
      return [];
    }
  }

  function writeJoins(joins) {
    localStorage.setItem(joinsStorageKey, JSON.stringify(joins));
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function eventIdFromLocation() {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("id");
    if (fromQuery) return fromQuery;
    const match = window.location.pathname.match(/\/events\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function localJoinCount(eventId) {
    return readJoins().filter((join) => join.eventId === eventId).length;
  }

  function hasJoined(eventId) {
    return readJoins().some((join) => join.eventId === eventId);
  }

  function currentShareUrl(eventId) {
    const url = new URL(window.location.href);
    url.pathname = url.pathname.endsWith("event.html") ? url.pathname : "/event.html";
    url.search = `?id=${encodeURIComponent(eventId)}`;
    url.hash = "";
    return url.toString();
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

  function allEvents() {
    return [
      ...seedEvents,
      ...readSubmissions().map(submissionToEvent)
    ];
  }

  function renderNotFound() {
    page.innerHTML = `
      <section class="section not-found">
        <p class="eyebrow dark">Event not found</p>
        <h1>This Blue Moon event link does not exist yet.</h1>
        <a class="button primary" href="index.html#events">See upcoming events</a>
      </section>
    `;
  }

  function renderEvent(event) {
    const count = event.participantCount + localJoinCount(event.id);
    const isCompleted = event.status === "completed";
    const joined = hasJoined(event.id);
    document.title = `${event.title} | Blue Moon`;

    page.innerHTML = `
      <section class="event-hero">
        <div class="event-hero-media">
          <img src="${escapeHtml(event.imageUrl)}" alt="${escapeHtml(event.imageAlt)}">
        </div>
        <div class="event-hero-content">
          <div class="card-meta">
            <span>${escapeHtml(event.category)}</span>
            ${event.source === "org" ? "<span>Approved org</span>" : ""}
            ${event.source === "one-off" ? "<span>One-off post</span>" : ""}
            <span>${isCompleted ? "Completed" : "Upcoming"}</span>
          </div>
          <h1>${escapeHtml(event.title)}</h1>
          <p>${escapeHtml(event.summary)}</p>
          <div class="event-action-row">
            ${
              isCompleted
                ? `<a class="button primary" href="#proof">See proof</a>`
                : `<button class="button primary" id="join-trigger" type="button">${joined ? "You are joining" : "I'm joining"}</button>`
            }
            <button class="button light-outline" id="share-event" type="button">Share</button>
          </div>
          <p class="form-note" id="share-note" role="status"></p>
        </div>
      </section>

      <section class="section event-detail-grid">
        <aside class="event-sidebar">
          <dl class="detail-list">
            <div>
              <dt>Date</dt>
              <dd>${escapeHtml(event.dateLabel)}</dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>${escapeHtml(event.timeLabel)}</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>${escapeHtml(event.locationName)}</dd>
            </div>
            <div>
              <dt>Joining</dt>
              <dd><span id="join-count">${count}</span>${event.maxParticipants ? ` of ${event.maxParticipants}` : ""}</dd>
            </div>
            <div>
              <dt>Organizer</dt>
              <dd>${escapeHtml(event.organizer)} · ${escapeHtml(event.organizerRole)}</dd>
            </div>
          </dl>
        </aside>

        <div class="event-main-copy">
          <h2>What to know</h2>
          <p>${escapeHtml(event.description)}</p>
          <h2>${isCompleted ? "Event note" : "Bring"}</h2>
          <p>${escapeHtml(event.bring)}</p>

          ${
            isCompleted
              ? `
                <div class="impact-panel" id="proof">
                  <p class="eyebrow dark">Post-event proof</p>
                  <h2>${escapeHtml(event.impactMetric)}</h2>
                  <p>${escapeHtml(event.proofSummary)}</p>
                </div>
              `
              : `
                <form class="join-form" id="join-form" ${joined ? "" : "hidden"}>
                  <h2>Join this event</h2>
                  <label>
                    Name
                    <input name="name" type="text" autocomplete="name" required>
                  </label>
                  <label>
                    Email
                    <input name="email" type="email" autocomplete="email" required>
                  </label>
                  <button class="button dark wide" type="submit">Confirm spot</button>
                  <p class="form-note" id="join-note" role="status">${joined ? "You are already on the local join list for this prototype." : ""}</p>
                </form>
              `
          }
        </div>
      </section>
    `;

    wireEventActions(event);
  }

  function wireEventActions(event) {
    const joinTrigger = document.querySelector("#join-trigger");
    const joinForm = document.querySelector("#join-form");
    const joinCount = document.querySelector("#join-count");
    const shareButton = document.querySelector("#share-event");
    const shareNote = document.querySelector("#share-note");

    if (joinTrigger && joinForm) {
      joinTrigger.addEventListener("click", () => {
        joinForm.hidden = false;
        joinForm.scrollIntoView({ behavior: "smooth", block: "center" });
      });

      joinForm.addEventListener("submit", (submitEvent) => {
        submitEvent.preventDefault();
        if (!hasJoined(event.id)) {
          const data = Object.fromEntries(new FormData(joinForm).entries());
          const joins = readJoins();
          joins.push({
            ...data,
            eventId: event.id,
            createdAt: new Date().toISOString()
          });
          writeJoins(joins);
        }

        const count = event.participantCount + localJoinCount(event.id);
        joinCount.textContent = count;
        joinTrigger.textContent = "You are joining";
        document.querySelector("#join-note").textContent = "You are on the list. Confirmation email comes next in the real MVP.";
      });
    }

    if (shareButton) {
      shareButton.addEventListener("click", async () => {
        const url = currentShareUrl(event.id);
        try {
          if (navigator.share) {
            await navigator.share({
              title: `${event.title} on Blue Moon`,
              text: event.summary,
              url
            });
          } else if (navigator.clipboard) {
            await navigator.clipboard.writeText(url);
            shareNote.textContent = "Event link copied.";
          } else {
            shareNote.textContent = url;
          }
        } catch (error) {
          shareNote.textContent = "Share cancelled.";
        }
      });
    }
  }

  const selected = allEvents().find((event) => event.id === eventIdFromLocation());
  if (selected) {
    renderEvent(selected);
  } else {
    renderNotFound();
  }
})();
