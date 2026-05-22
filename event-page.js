(function () {
  const seedEvents = window.BLUE_MOON_EVENTS || [];
  const page = document.querySelector("#event-page");
  const joinsStorageKey = "blueMoonJoins";
  const submissionsStorageKey = "blueMoonEventSubmissions";
  const trustReportsStorageKey = "blueMoonTrustReports";
  const site = window.BLUE_MOON_SITE || {
    name: "Blue Moon",
    searchName: "Blue Moon Beige",
    alternateNames: ["Blue Moon Beige", "BlueMoon Beige", "bluemoon beige"],
    url: "https://bluemoonbeige.vercel.app",
    description: "Blue Moon Beige helps people find, create, join, and share local Blue Moon events for doing good.",
    image: "",
    backendEnabled: false
  };
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

  function readTrustReports() {
    try {
      return JSON.parse(localStorage.getItem(trustReportsStorageKey)) || [];
    } catch (error) {
      return [];
    }
  }

  function writeTrustReports(reports) {
    localStorage.setItem(trustReportsStorageKey, JSON.stringify(reports));
  }

  function normalizeEmail(value) {
    return window.BLUE_MOON_ACCOUNT
      ? window.BLUE_MOON_ACCOUNT.normalizeEmail(value)
      : String(value || "").trim().toLowerCase();
  }

  function eventJoins(eventId) {
    return readJoins().filter((join) => join.eventId === eventId);
  }

  function currentJoin(eventId) {
    const joins = eventJoins(eventId);
    const account = window.BLUE_MOON_ACCOUNT ? window.BLUE_MOON_ACCOUNT.current() : null;
    const accountEmail = account ? normalizeEmail(account.email) : "";
    const join = accountEmail
      ? joins.find((candidate) => normalizeEmail(candidate.email) === accountEmail)
      : joins[0];
    if (!join) return null;
    return {
      visibility: "private",
      reminderOptIn: false,
      receiptStatus: "ready",
      ...join,
      id: join.id || `join-${slugify(eventId)}-saved`,
      calendarUid: join.calendarUid || `${slugify(eventId)}-saved@blue-moon`
    };
  }

  function publicJoins(eventId) {
    return eventJoins(eventId).filter((join) => join.visibility === "public" && join.name);
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
    return eventJoins(eventId).length;
  }

  function hasJoined(eventId) {
    return Boolean(currentJoin(eventId));
  }

  function currentShareUrl(eventId) {
    const url = new URL(window.location.href);
    if (isLocalHost()) {
      url.pathname = url.pathname.endsWith("event.html") ? url.pathname : "/event.html";
      url.search = `?id=${encodeURIComponent(eventId)}`;
    } else {
      url.pathname = eventPath(eventId);
      url.search = "";
    }
    url.hash = "";
    return url.toString();
  }

  function isLocalHost() {
    return ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
  }

  function siteUrl(path) {
    const base = site.url.replace(/\/$/, "");
    const nextPath = path.startsWith("/") ? path : `/${path}`;
    return `${base}${nextPath}`;
  }

  function eventPath(eventId) {
    return `/events/${encodeURIComponent(eventId)}`;
  }

  function eventAbsoluteUrl(event) {
    return siteUrl(eventPath(event.id));
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

  function setMarkdownAlternate(href) {
    let alternate = document.head.querySelector('link[rel="alternate"][type="text/markdown"]');
    if (!alternate) {
      alternate = document.createElement("link");
      alternate.rel = "alternate";
      alternate.type = "text/markdown";
      alternate.title = "Blue Moon event Markdown";
      document.head.append(alternate);
    }
    alternate.href = href;
  }

  function eventStructuredData(event) {
    return {
      "@context": "https://schema.org",
      "@type": "Event",
      name: event.title,
      description: event.summary || event.description,
      startDate: event.dateTime,
      eventStatus: event.status === "completed"
        ? "https://schema.org/EventCompleted"
        : "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      isAccessibleForFree: true,
      image: [event.imageUrl],
      url: eventAbsoluteUrl(event),
      location: {
        "@type": "Place",
        name: event.locationName,
        address: {
          "@type": "PostalAddress",
          addressLocality: event.city || "",
          postalCode: event.zip || "",
          addressRegion: "CA",
          addressCountry: "US"
        }
      },
      organizer: {
        "@type": event.source === "org" ? "Organization" : "Person",
        name: event.organizer
      },
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        url: eventAbsoluteUrl(event)
      },
      maximumAttendeeCapacity: event.maxParticipants || undefined,
      remainingAttendeeCapacity: event.maxParticipants
        ? Math.max(event.maxParticipants - (event.participantCount || 0) - localJoinCount(event.id), 0)
        : undefined
    };
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

  function setEventMetadata(event) {
    const title = `${event.title} | ${site.searchName || site.name || "Blue Moon"}`;
    const description = event.summary || event.description || site.description;
    const url = eventAbsoluteUrl(event);
    document.title = title;
    setCanonical(url);
    setMarkdownAlternate(`${url}.md`);
    setMeta("name", "description", description);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", url);
    setMeta("property", "og:image", event.imageUrl || site.image);
    setMeta("property", "og:image:alt", event.imageAlt || `${event.title} on ${site.searchName || site.name || "Blue Moon"}`);
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", event.imageUrl || site.image);
    setMeta("name", "twitter:image:alt", event.imageAlt || `${event.title} on ${site.searchName || site.name || "Blue Moon"}`);
    injectJsonLd("blue-moon-event-structured-data", eventStructuredData(event));
  }

  function slugify(value) {
    return String(value)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "event";
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

  function formatTimeLabel(value) {
    if (!value) return "Time to be confirmed";
    const [hourValue, minuteValue] = value.split(":");
    const date = new Date();
    date.setHours(Number(hourValue), Number(minuteValue), 0, 0);
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit"
    }).format(date);
  }

  function capacityValue(value) {
    const capacity = Number(value);
    return Number.isFinite(capacity) && capacity > 0 ? capacity : null;
  }

  function safeExternalUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      const url = new URL(raw);
      return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
    } catch (error) {
      return "";
    }
  }

  function instagramUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (raw.startsWith("@")) {
      return `https://instagram.com/${encodeURIComponent(raw.slice(1))}`;
    }
    if (/^[a-zA-Z0-9._]+$/.test(raw)) {
      return `https://instagram.com/${encodeURIComponent(raw)}`;
    }
    return safeExternalUrl(raw);
  }

  function formatIcsDate(date) {
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  }

  function escapeIcs(value) {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }

  function eventStartDate(event) {
    const date = new Date(event.dateTime);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function calendarFilename(event) {
    return `${slugify(event.title)}.ics`;
  }

  function createCalendarFile(event, join) {
    const start = eventStartDate(event) || new Date();
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const eventUrl = currentShareUrl(event.id);
    const description = [
      event.summary,
      "",
      `Bring: ${event.bring}`,
      `Organizer: ${event.organizer}`,
      `Event link: ${eventUrl}`
    ].join("\n");

    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Blue Moon//Event Join//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${escapeIcs(join.calendarUid || `${join.id}@blue-moon`)}`,
      `DTSTAMP:${formatIcsDate(new Date())}`,
      `DTSTART:${formatIcsDate(start)}`,
      `DTEND:${formatIcsDate(end)}`,
      `SUMMARY:${escapeIcs(event.title)}`,
      `LOCATION:${escapeIcs(event.locationName)}`,
      `DESCRIPTION:${escapeIcs(description)}`,
      `URL:${escapeIcs(eventUrl)}`,
      "BEGIN:VALARM",
      "TRIGGER:-PT2H",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeIcs(`Reminder: ${event.title} today`)}`,
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\r\n");
  }

  function calendarHref(event, join) {
    return `data:text/calendar;charset=utf-8,${encodeURIComponent(createCalendarFile(event, join))}`;
  }

  async function sendJoinReceipt(event, join) {
    if (!site.backendEnabled) {
      return { ok: true, emailSent: false, backendSkipped: true };
    }

    try {
      const response = await fetch("/api/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          event: {
            id: event.id,
            url: currentShareUrl(event.id)
          },
          join: {
            id: join.id,
            name: join.name,
            email: join.email,
            visibility: join.visibility,
            reminderOptIn: join.reminderOptIn,
            website: join.website || ""
          }
        })
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          ok: false,
          emailSent: false,
          ...result
        };
      }
      return {
        ok: true,
        ...result
      };
    } catch (error) {
      return { ok: false, emailSent: false, error: "network_error" };
    }
  }

  function joinErrorMessage(error) {
    if (error === "duplicate_join") return "That email is already on the list for this event.";
    if (error === "event_full") return "This event is full.";
    if (error === "rate_limited") return "Too many join attempts. Please wait a few minutes and try again.";
    if (error === "bot_detected") return "We could not save this join. Please try again.";
    if (error === "event_not_found") return "This event is not accepting joins right now.";
    if (error === "email_send_failed") return "You're on the list, but the email receipt could not be sent.";
    return "We could not save this join. Please try again.";
  }

  async function sendTrustReport(event, report) {
    if (!site.backendEnabled) {
      return { ok: true, reportSaved: false, backendSkipped: true };
    }

    try {
      const response = await fetch("/api/trust-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          target: {
            eventId: event.id
          },
          report: {
            reason: report.reason,
            details: report.details,
            reporterEmail: report.reporterEmail,
            website: report.website || ""
          }
        })
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          ok: false,
          reportSaved: false,
          ...result
        };
      }
      return {
        ok: true,
        ...result
      };
    } catch (error) {
      return { ok: false, reportSaved: false, error: "network_error" };
    }
  }

  function trustReportErrorMessage(error) {
    if (error === "rate_limited") return "Too many reports were submitted from this browser. Please wait a few minutes and try again.";
    if (error === "invalid_email") return "Use a valid email address, or leave the email field blank.";
    if (error === "missing_details") return "Add a few details so maintainers can review the concern.";
    if (error === "bot_detected") return "We could not submit this report. Please try again.";
    return "We could not submit this report. Please try again.";
  }

  function submissionId(submission, index) {
    if (submission.id) return submission.id;
    const created = Date.parse(submission.createdAt || "");
    const suffix = Number.isNaN(created) ? index : created;
    return `local-${slugify(submission.title)}-${suffix}`;
  }

  function submissionToEvent(submission, index) {
    const image = categoryImages[submission.category] || fallbackImage;
    const locationParts = [
      submission.location,
      submission.city,
      submission.zip
    ].filter(Boolean);
    return {
      id: submissionId(submission, index),
      title: submission.title,
      category: submission.category || "Community help",
      status: "published",
      locationName: locationParts.join(", ") || "Location to be confirmed",
      city: submission.city || "",
      zip: submission.zip || "",
      dateLabel: formatDateLabel(submission.date),
      timeLabel: formatTimeLabel(submission.startTime),
      dateTime: submission.date ? `${submission.date}T${submission.startTime || "12:00"}:00` : submission.createdAt,
      organizer: submission.organizer || submission.organizationName || "Local organizer",
      organizerEmail: submission.email || submission.organizerEmail || "",
      organizerRole: submission.organizerRole || "One-off host",
      participantCount: 0,
      maxParticipants: capacityValue(submission.maxParticipants),
      instagramUrl: instagramUrl(submission.instagram),
      socialUrl: safeExternalUrl(submission.socialUrl),
      imageUrl: image.imageUrl,
      imageAlt: image.imageAlt,
      summary: submission.description || "A community-created event on Blue Moon.",
      description: submission.description || "The organizer is still adding details.",
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
        <h1>This Blue Moon event link does not exist.</h1>
        <a class="button primary" href="index.html#events">See upcoming events</a>
      </section>
    `;
  }

  function participantSummary(event, totalCount) {
    const publicCount = publicJoins(event.id).length;
    const privateCount = eventJoins(event.id).length - publicCount;
    const countLabel = totalCount === 1 ? "1 person is joining." : `${totalCount} people are joining.`;
    if (privateCount > 0) {
      const privateLabel = privateCount === 1 ? "1 private join is hidden." : `${privateCount} private joins are hidden.`;
      return `${countLabel} ${privateLabel}`;
    }
    return `${countLabel} Names appear only when people choose public.`;
  }

  function publicJoinListMarkup(eventId) {
    const joins = publicJoins(eventId);
    if (!joins.length) {
      return `<p class="empty-state">No public names yet. Private joins still count, but names stay hidden.</p>`;
    }

    return `
      <ul class="public-join-list">
        ${joins.map((join) => `<li>${escapeHtml(join.name)}</li>`).join("")}
      </ul>
    `;
  }

  function socialLinksMarkup(event) {
    const links = [
      event.instagramUrl ? { label: "Instagram", href: event.instagramUrl } : null,
      event.socialUrl ? { label: "Social link", href: event.socialUrl } : null
    ].filter(Boolean);

    if (!links.length) return "";
    return `
      <div class="social-links">
        ${links.map((link) => `<a href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a>`).join("")}
      </div>
    `;
  }

  function joinConfirmationMarkup(event, join) {
    const receiptStatus = join.receiptStatus === "sent"
      ? `Receipt sent to ${escapeHtml(join.email)}.`
      : `Receipt saved for ${escapeHtml(join.email)}.`;
    const reminderStatus = join.reminderOptIn
      ? "Day-of reminder requested. The calendar file also includes an event reminder."
      : "Day-of reminder is off.";

    return `
      <h2>You're joining</h2>
      <p>${receiptStatus}</p>
      <p>${reminderStatus}</p>
      <div class="receipt-preview">
        <strong>${escapeHtml(event.title)}</strong>
        <span>${escapeHtml(event.dateLabel)} · ${escapeHtml(event.timeLabel)}</span>
        <span>${escapeHtml(event.locationName)}</span>
      </div>
      <a class="button dark wide" href="${calendarHref(event, join)}" download="${escapeHtml(calendarFilename(event))}">Add to calendar</a>
    `;
  }

  function trustReportMarkup(event) {
    return `
      <div class="report-panel">
        <div class="report-panel-heading">
          <div>
            <h2>Report a concern</h2>
            <p>Flag unsafe details, privacy issues, misleading information, abusive joins, or proof concerns.</p>
          </div>
          <button class="text-button" id="report-toggle" type="button" aria-expanded="false" aria-controls="trust-report-form">Open report form</button>
        </div>
        <form class="report-form" id="trust-report-form" hidden>
          <label>
            Concern type
            <select name="reason" required>
              <option value="">Choose one</option>
              <option value="unsafe_event">Unsafe event</option>
              <option value="privacy">Privacy issue</option>
              <option value="wrong_or_misleading">Wrong or misleading information</option>
              <option value="abusive_join">Abusive join or roster issue</option>
              <option value="bad_proof">Proof concern</option>
              <option value="other">Something else</option>
            </select>
          </label>
          <label>
            Your email, optional
            <input name="reporterEmail" type="email" autocomplete="email">
          </label>
          <label>
            Details
            <textarea name="details" rows="4" minlength="10" maxlength="4000" placeholder="What should maintainers review?" required></textarea>
          </label>
          <label class="bot-field" aria-hidden="true">
            Website
            <input name="website" type="text" autocomplete="off" tabindex="-1">
          </label>
          <p class="helper-text">Do not post private personal information in public issues. For urgent or sensitive concerns, contact the project owner privately through GitHub.</p>
          <button class="button light-outline wide" type="submit">Send report</button>
          <p class="form-note" id="trust-report-note" role="status"></p>
        </form>
      </div>
    `;
  }

  function renderEvent(event) {
    const count = event.participantCount + localJoinCount(event.id);
    const isCompleted = event.status === "completed";
    const existingJoin = currentJoin(event.id);
    const joined = Boolean(existingJoin);
    const isFull = Boolean(event.maxParticipants && count >= event.maxParticipants && !joined);
    setEventMetadata(event);

    page.innerHTML = `
      <section class="event-hero">
        <div class="event-hero-media">
          <img src="${escapeHtml(event.imageUrl)}" alt="${escapeHtml(event.imageAlt)}">
        </div>
        <div class="event-hero-content">
          <div class="card-meta">
            <span>${escapeHtml(event.category)}</span>
            ${event.source === "org" ? "<span>Approved organization</span>" : ""}
            ${event.source === "one-off" ? "<span>One-off event</span>" : ""}
            <span>${isCompleted ? "Completed" : "Upcoming"}</span>
          </div>
          <h1>${escapeHtml(event.title)}</h1>
          <p>${escapeHtml(event.summary)}</p>
          <div class="event-action-row">
            ${
              isCompleted
                ? `<a class="button primary" href="#proof">See proof</a>`
                : joined
                  ? `<a class="button primary" href="#join-confirmation">You're joining</a>`
                  : isFull
                    ? `<button class="button primary" type="button" disabled>Event full</button>`
                  : `<button class="button primary" id="join-trigger" type="button">I'm joining</button>`
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
          ${socialLinksMarkup(event)}
          <div class="participant-panel">
            <h2>People joining</h2>
            <p class="participant-summary" id="participant-summary">${escapeHtml(participantSummary(event, count))}</p>
            <div id="public-join-list">${publicJoinListMarkup(event.id)}</div>
          </div>

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
                <form class="join-form" id="join-form" hidden>
                  <h2>Join this event</h2>
                  <label>
                    Name
                    <input name="name" type="text" autocomplete="name" required>
                  </label>
                  <label>
                    Email
                    <input name="email" type="email" autocomplete="email" required>
                  </label>
                  <label class="bot-field" aria-hidden="true">
                    Website
                    <input name="website" type="text" autocomplete="off" tabindex="-1">
                  </label>
                  <fieldset class="choice-group">
                    <legend>Show my name publicly?</legend>
                    <label class="choice-option">
                      <input name="visibility" type="radio" value="public" checked>
                      <span>Show my name on this event page</span>
                    </label>
                    <label class="choice-option">
                      <input name="visibility" type="radio" value="private">
                      <span>Keep my name private</span>
                    </label>
                  </fieldset>
                  <label class="checkbox-line">
                    <input name="reminderOptIn" type="checkbox" checked>
                    <span>Send me a day-of reminder</span>
                  </label>
                  <p class="helper-text">The organizer receives your name and email for event coordination. Your public/private choice only controls whether your name appears on this page.</p>
                  <button class="button dark wide" type="submit">Join event</button>
                  <p class="form-note" id="join-note" role="status">${joined ? "You are already on the list for this event." : ""}</p>
                </form>
                <div class="join-confirmation" id="join-confirmation" ${existingJoin ? "" : "hidden"}>
                  ${existingJoin ? joinConfirmationMarkup(event, existingJoin) : ""}
                </div>
              `
          }
          ${trustReportMarkup(event)}
        </div>
      </section>
    `;

    wireEventActions(event);
  }

  function wireEventActions(event) {
    const joinTrigger = document.querySelector("#join-trigger");
    const joinForm = document.querySelector("#join-form");
    const joinCount = document.querySelector("#join-count");
    const participantSummaryNode = document.querySelector("#participant-summary");
    const publicJoinList = document.querySelector("#public-join-list");
    const joinConfirmation = document.querySelector("#join-confirmation");
    const joinNote = document.querySelector("#join-note");
    const shareButton = document.querySelector("#share-event");
    const shareNote = document.querySelector("#share-note");
    const reportToggle = document.querySelector("#report-toggle");
    const reportForm = document.querySelector("#trust-report-form");
    const reportNote = document.querySelector("#trust-report-note");

    if (joinTrigger && joinForm) {
      const account = window.BLUE_MOON_ACCOUNT ? window.BLUE_MOON_ACCOUNT.current() : null;
      if (account) {
        if (joinForm.elements.name && !joinForm.elements.name.value) joinForm.elements.name.value = account.name;
        if (joinForm.elements.email && !joinForm.elements.email.value) joinForm.elements.email.value = account.email;
      }

      joinTrigger.addEventListener("click", () => {
        joinForm.hidden = false;
        joinForm.scrollIntoView({ behavior: "smooth", block: "center" });
      });

      joinForm.addEventListener("submit", async (submitEvent) => {
        submitEvent.preventDefault();
        let join = currentJoin(event.id);
        if (!hasJoined(event.id)) {
          const data = Object.fromEntries(new FormData(joinForm).entries());
          if (data.website) {
            if (joinNote) joinNote.textContent = joinErrorMessage("bot_detected");
            return;
          }
          if (event.maxParticipants && event.participantCount + localJoinCount(event.id) >= event.maxParticipants) {
            if (joinNote) joinNote.textContent = joinErrorMessage("event_full");
            return;
          }
          const joins = readJoins();
          join = {
            id: `join-${slugify(event.id)}-${Date.now()}`,
            eventId: event.id,
            name: data.name,
            email: data.email,
            visibility: data.visibility === "public" ? "public" : "private",
            reminderOptIn: data.reminderOptIn === "on",
            website: "",
            receiptStatus: "ready",
            reminderStatus: data.reminderOptIn === "on" ? "requested" : "off",
            calendarUid: `${slugify(event.id)}-${Date.now()}@blue-moon`,
            createdAt: new Date().toISOString()
          };
          if (joinNote) joinNote.textContent = site.backendEnabled ? "Saving your spot..." : "";

          const receiptResult = await sendJoinReceipt(event, join);
          if (!receiptResult.ok && !receiptResult.joinSaved) {
            if (joinNote) joinNote.textContent = joinErrorMessage(receiptResult.error);
            return;
          }

          join.receiptStatus = receiptResult.emailSent ? "sent" : "ready";
          join.emailMessageId = receiptResult.id || "";
          join.backendJoinId = receiptResult.joinId || "";
          joins.push(join);
          writeJoins(joins);
          if (joinNote && receiptResult.error) {
            joinNote.textContent = joinErrorMessage(receiptResult.error);
          } else if (joinNote) {
            joinNote.textContent = "";
          }
        }

        const count = event.participantCount + localJoinCount(event.id);
        joinCount.textContent = count;
        joinTrigger.textContent = "You are joining";
        if (participantSummaryNode) participantSummaryNode.textContent = participantSummary(event, count);
        if (publicJoinList) publicJoinList.innerHTML = publicJoinListMarkup(event.id);
        if (joinConfirmation && join) {
          joinConfirmation.innerHTML = joinConfirmationMarkup(event, join);
          joinConfirmation.hidden = false;
        }
        joinForm.hidden = true;
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

    if (reportToggle && reportForm) {
      reportToggle.addEventListener("click", () => {
        const isOpening = reportForm.hidden;
        reportForm.hidden = !isOpening;
        reportToggle.setAttribute("aria-expanded", String(isOpening));
        reportToggle.textContent = isOpening ? "Close report form" : "Open report form";
        if (isOpening) reportForm.querySelector("select")?.focus();
      });

      reportForm.addEventListener("submit", async (submitEvent) => {
        submitEvent.preventDefault();
        const data = Object.fromEntries(new FormData(reportForm).entries());
        if (data.website) {
          if (reportNote) reportNote.textContent = trustReportErrorMessage("bot_detected");
          return;
        }

        const report = {
          id: `trust-report-${slugify(event.id)}-${Date.now()}`,
          eventId: event.id,
          eventTitle: event.title,
          reason: data.reason,
          details: data.details,
          reporterEmail: data.reporterEmail,
          website: "",
          createdAt: new Date().toISOString()
        };

        if (reportNote) reportNote.textContent = site.backendEnabled ? "Submitting report..." : "";
        const result = await sendTrustReport(event, report);
        if (!result.ok) {
          if (reportNote) reportNote.textContent = trustReportErrorMessage(result.error);
          return;
        }

        if (result.reportSaved) {
          if (reportNote) reportNote.textContent = "Report sent to the Blue Moon review queue.";
        } else {
          const reports = readTrustReports();
          reports.push({
            ...report,
            backendStatus: result.reason || "local_demo"
          });
          writeTrustReports(reports);
          if (reportNote) reportNote.textContent = "Report saved in this browser for the demo. For urgent or sensitive concerns, contact the project owner privately through GitHub.";
        }
        reportForm.reset();
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
