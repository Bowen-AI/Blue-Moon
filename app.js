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
  const eventTemplate = document.querySelector("#event-template");
  const templateHint = document.querySelector("#template-hint");
  const locationFilter = document.querySelector("#location-filter");
  const categoryFilter = document.querySelector("#category-filter");
  const timeFilter = document.querySelector("#time-filter");
  const clearFilters = document.querySelector("#clear-filters");
  const filterSummary = document.querySelector("#filter-summary");
  const accountForm = document.querySelector("#account-form");
  const accountAction = document.querySelector("#account-action");
  const accountNameField = document.querySelector("#account-name-field");
  const accountSubmit = document.querySelector("#account-submit");
  const accountDashboard = document.querySelector("#account-dashboard");
  const memberLookupForm = document.querySelector("#member-lookup-form");
  const memberResults = document.querySelector("#member-results");
  const pastEventShowcase = document.querySelector("#past-event-showcase");
  const shareDemoCard = document.querySelector("#share-demo-card");
  const showcaseTabs = Array.from(document.querySelectorAll("[data-showcase-tab]"));
  const showcasePanels = Array.from(document.querySelectorAll("[data-showcase-panel]"));
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

  const templates = {
    custom: {
      hint: "Choose a template to fill in the basics, or start with a custom event."
    },
    "beach-cleanup": {
      title: "Beach Cleanup",
      category: "Beach cleanup",
      startTime: "09:00",
      suggestedCapacity: 30,
      description: "Meet for a relaxed beach cleanup. Bring water, sun protection, and comfortable shoes. Bags and gloves will be provided if available.",
      hint: "Best for simple weekend meetups with clear before-and-after photos."
    },
    "park-cleanup": {
      title: "Park Cleanup",
      category: "Park cleanup",
      startTime: "10:00",
      suggestedCapacity: 24,
      description: "Help pick up litter around the park paths and shared spaces. First-timers are welcome, and we will split into small groups.",
      hint: "Simple local action. Works well for neighborhoods, schools, and friend groups."
    },
    "food-pantry": {
      title: "Food Pantry Packing",
      category: "Food help",
      startTime: "18:00",
      suggestedCapacity: 16,
      description: "Help sort supplies and pack food bags for local distribution. Wear comfortable shoes and come ready for light indoor work.",
      hint: "Useful for recurring weekday evening volunteer shifts."
    },
    "community-garden": {
      title: "Community Garden Day",
      category: "Community garden",
      startTime: "10:00",
      suggestedCapacity: 12,
      description: "Help weed, mulch, water, and prep shared garden beds. No gardening experience is needed.",
      hint: "Great for neighbors who want a friendly outdoor event."
    },
    "tree-planting": {
      title: "Tree Planting",
      category: "Tree planting",
      startTime: "09:30",
      suggestedCapacity: 18,
      description: "Join a small group to plant and mulch young trees. Bring water, closed-toe shoes, and gloves if you have them.",
      hint: "Best when the organizer already has trees, tools, and permission."
    },
    "neighborhood-help": {
      title: "Neighborhood Help Day",
      category: "Neighborhood support",
      startTime: "11:00",
      suggestedCapacity: 10,
      description: "A simple meetup to help neighbors with small tasks, cleanup, sorting, or setup. Details will be confirmed by the organizer.",
      hint: "Flexible template for one-off local support that does not fit another category."
    }
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

  function activeAccount() {
    return window.BLUE_MOON_ACCOUNT ? window.BLUE_MOON_ACCOUNT.current() : null;
  }

  function normalizeEmail(value) {
    return window.BLUE_MOON_ACCOUNT
      ? window.BLUE_MOON_ACCOUNT.normalizeEmail(value)
      : String(value || "").trim().toLowerCase();
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function sendEarlyAccessRequest(data) {
    if (!site.backendEnabled) {
      return { ok: true, requestSaved: false, notificationSent: false, backendSkipped: true };
    }

    try {
      const response = await fetch("/api/early-access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          waitlist: {
            name: data.name,
            email: data.email,
            interest: data.interest,
            website: data.website || ""
          }
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          ok: false,
          requestSaved: false,
          notificationSent: false,
          ...result
        };
      }
      return {
        ok: true,
        ...result
      };
    } catch (error) {
      return { ok: false, requestSaved: false, notificationSent: false, error: "network_error" };
    }
  }

  function earlyAccessMessage(result) {
    if (result.requestSaved && result.notificationSent) {
      return "You're on the early access list. The Blue Moon team has been notified.";
    }
    if (result.requestSaved) {
      return "You're on the early access list. The Blue Moon team can see it in Supabase.";
    }
    return "You're on the early access list in this browser.";
  }

  function earlyAccessErrorMessage(error) {
    if (error === "duplicate_request") return "That email is already on the early access list.";
    if (error === "rate_limited") return "Too many early access requests. Please wait a few minutes and try again.";
    if (error === "invalid_email") return "Use a valid email address.";
    if (error === "invalid_interest") return "Choose how you want to use Blue Moon.";
    if (error === "missing_name") return "Add your name before joining early access.";
    if (error === "bot_detected") return "We could not save this request. Please try again.";
    return "We could not save this request. Please try again.";
  }

  function localJoinCount(eventId) {
    return readStored(storage.joins).filter((join) => join.eventId === eventId).length;
  }

  function isLocalHost() {
    return ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
  }

  function siteUrl(path) {
    const base = site.url.replace(/\/$/, "");
    const nextPath = path.startsWith("/") ? path : `/${path}`;
    return `${base}${nextPath}`;
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

  function approvedOrganizations() {
    return readStored(storage.organizations).filter((organization) => organization.status === "approved");
  }

  function localSubmissionEvents() {
    return readStored(storage.submissions).map(submissionToEvent);
  }

  function allDashboardEvents() {
    return [
      ...seedEvents,
      ...localSubmissionEvents()
    ];
  }

  function browsableEvents() {
    return [
      ...seedEvents.filter((event) => event.status === "published"),
      ...localSubmissionEvents()
    ];
  }

  function filterValues() {
    return {
      location: (locationFilter ? locationFilter.value : "").trim().toLowerCase(),
      category: categoryFilter ? categoryFilter.value : "all",
      time: timeFilter ? timeFilter.value : "any"
    };
  }

  function eventLocationText(event) {
    return [
      event.title,
      event.locationName,
      event.city,
      event.zip,
      event.category,
      event.organizer
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function dateOnly(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function daysFromToday(date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((date.getTime() - today.getTime()) / 86400000);
  }

  function matchesTime(event, value) {
    if (value === "any") return true;
    const eventDate = dateOnly(event.dateTime);
    if (!eventDate) return false;
    const delta = daysFromToday(eventDate);
    if (value === "today") return delta === 0;
    if (value === "week") return delta >= 0 && delta <= 7;
    if (value === "month") return delta >= 0 && delta <= 30;
    return true;
  }

  function filteredEvents(events) {
    const filters = filterValues();
    return events.filter((event) => {
      const locationMatch = !filters.location || eventLocationText(event).includes(filters.location);
      const categoryMatch = filters.category === "all" || event.category === filters.category;
      return locationMatch && categoryMatch && matchesTime(event, filters.time);
    });
  }

  function renderFilterSummary(visibleCount, totalCount) {
    if (!filterSummary) return;
    const filters = filterValues();
    const active = [];
    if (filters.location) active.push(`near "${filters.location}"`);
    if (filters.category !== "all") active.push(filters.category);
    if (filters.time !== "any") {
      active.push(timeFilter.options[timeFilter.selectedIndex].textContent.toLowerCase());
    }
    filterSummary.textContent = active.length
      ? `Showing ${visibleCount} of ${totalCount} events for ${active.join(" · ")}.`
      : `Showing ${visibleCount} upcoming events.`;
  }

  function eventPath(event) {
    return `/events/${encodeURIComponent(event.id)}`;
  }

  function eventHref(event) {
    if (isLocalHost()) return `event.html?id=${encodeURIComponent(event.id)}`;
    return eventPath(event).slice(1);
  }

  function eventAbsoluteUrl(event) {
    return siteUrl(eventPath(event));
  }

  function eventPublicUrl(event) {
    if (isLocalHost()) return new URL(eventHref(event), window.location.href).toString();
    return eventAbsoluteUrl(event);
  }

  function eventImpactText(event) {
    if (event.impactMetric) return event.impactMetric;
    if (event.status === "completed") return `${event.participantCount} people joined`;
    return `${event.category} · ${event.dateLabel}`;
  }

  function eventShareText(event) {
    return `I did something good with Blue Moon: ${event.title}. ${eventImpactText(event)}`;
  }

  function socialShareHref(platform, event) {
    const url = encodeURIComponent(eventPublicUrl(event));
    const text = encodeURIComponent(eventShareText(event));
    if (platform === "x") return `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
    if (platform === "linkedin") return `https://www.linkedin.com/sharing/share-offsite/?url=${url}`;
    if (platform === "facebook") return `https://www.facebook.com/sharer/sharer.php?u=${url}`;
    if (platform === "threads") return `https://www.threads.net/intent/post?text=${encodeURIComponent(`${eventShareText(event)} ${eventPublicUrl(event)}`)}`;
    return eventPublicUrl(event);
  }

  function renderShareActions(event, compact = false) {
    const url = eventPublicUrl(event);
    const text = eventShareText(event);
    const label = compact ? "share-actions compact" : "share-actions";
    return `
      <div class="${label}" aria-label="Share ${escapeHtml(event.title)}">
        <a class="share-chip" href="${escapeHtml(socialShareHref("x", event))}" target="_blank" rel="noreferrer">X</a>
        <a class="share-chip" href="${escapeHtml(socialShareHref("linkedin", event))}" target="_blank" rel="noreferrer">LinkedIn</a>
        <a class="share-chip" href="${escapeHtml(socialShareHref("facebook", event))}" target="_blank" rel="noreferrer">Facebook</a>
        <a class="share-chip" href="${escapeHtml(socialShareHref("threads", event))}" target="_blank" rel="noreferrer">Threads</a>
        <button class="share-chip" type="button" data-open-social="instagram" data-share-url="${escapeHtml(url)}" data-share-text="${escapeHtml(text)}">Instagram</button>
        <button class="share-chip" type="button" data-open-social="tiktok" data-share-url="${escapeHtml(url)}" data-share-text="${escapeHtml(text)}">TikTok</button>
        <button class="share-chip" type="button" data-copy-share data-share-url="${escapeHtml(url)}" data-share-text="${escapeHtml(text)}">Copy link</button>
        <button class="share-chip primary" type="button" data-native-share data-share-url="${escapeHtml(url)}" data-share-text="${escapeHtml(text)}" data-share-title="${escapeHtml(event.title)}">Share</button>
      </div>
    `;
  }

  function isShareablePastEvent(event) {
    if (event.status === "completed") return true;
    const eventDate = dateOnly(event.dateTime);
    return eventDate ? daysFromToday(eventDate) < 0 : false;
  }

  function uniqueEvents(events) {
    const seen = new Map();
    events.forEach((event) => {
      if (event && event.id && !seen.has(event.id)) seen.set(event.id, event);
    });
    return Array.from(seen.values());
  }

  function shareablePastEvents(events) {
    return uniqueEvents(events)
      .filter(isShareablePastEvent)
      .sort((first, second) => new Date(second.dateTime).getTime() - new Date(first.dateTime).getTime());
  }

  function eventStructuredData(event) {
    return {
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
        ? Math.max(event.maxParticipants - (event.participantCount || 0), 0)
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

  function injectHomeStructuredData() {
    const structuredEvents = seedEvents.map(eventStructuredData);
    injectJsonLd("blue-moon-structured-data", [
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: site.searchName || site.name,
        alternateName: site.alternateNames || [site.name],
        url: site.url,
        description: site.description,
        image: site.image,
        inLanguage: "en-US"
      },
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: site.name,
        alternateName: site.alternateNames || undefined,
        url: site.url,
        logo: site.icon,
        slogan: site.tagline,
        description: site.description
      },
      {
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: "Blue Moon Beige public event data",
        description: "Machine-readable seed event data for the Blue Moon Beige static MVP.",
        url: site.eventsJson,
        license: `${site.url}/SUPPORT.md`,
        creator: {
          "@type": "Organization",
          name: site.name,
          url: site.url
        }
      },
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: "Blue Moon Beige local events for doing good",
        itemListElement: seedEvents.map((event, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: eventAbsoluteUrl(event),
          name: event.title
        }))
      },
      ...structuredEvents.map((event) => ({
        "@context": "https://schema.org",
        ...event
      }))
    ]);
  }

  function renderEventCards() {
    const allPublished = browsableEvents();
    const published = filteredEvents(allPublished);
    renderFilterSummary(published.length, allPublished.length);

    if (!published.length) {
      eventFeed.innerHTML = `
        <p class="empty-state browse-empty">No events match those filters yet. Try another city, ZIP, time, or category.</p>
      `;
      return;
    }

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
                ${event.source === "org" ? "<span>Approved organization</span>" : ""}
                ${event.source === "one-off" ? "<span>One-off event</span>" : ""}
                <span>${count}${event.maxParticipants ? ` of ${event.maxParticipants}` : ""} joining</span>
              </div>
              <h3><a href="${eventHref(event)}">${escapeHtml(event.title)}</a></h3>
              <p>${escapeHtml(event.summary)}</p>
              <dl class="event-facts">
                <div>
                  <dt>Date</dt>
                  <dd>${escapeHtml(event.dateLabel)}</dd>
                </div>
                <div>
                  <dt>Time</dt>
                  <dd>${escapeHtml(event.timeLabel)}</dd>
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
        <div class="proof-actions">
          <a class="button light-outline" href="${eventHref(completed)}">View share page</a>
          ${renderShareActions(completed, true)}
        </div>
      </div>
    `;
  }

  function renderPastEventCard(event) {
    const proofText = event.proofSummary || event.summary || "A past good-action event on Blue Moon.";
    return `
      <article class="past-event-card">
        <a class="event-image-link" href="${eventHref(event)}" aria-label="Open ${escapeHtml(event.title)}">
          <img src="${escapeHtml(event.imageUrl)}" alt="${escapeHtml(event.imageAlt)}" loading="lazy">
        </a>
        <div class="past-event-body">
          <div class="card-meta">
            <span>${escapeHtml(event.category)}</span>
            <span>${event.status === "completed" ? "Proof posted" : "Past event"}</span>
          </div>
          <h3><a href="${eventHref(event)}">${escapeHtml(event.title)}</a></h3>
          <p class="impact-line">${escapeHtml(eventImpactText(event))}</p>
          <p>${escapeHtml(proofText)}</p>
          ${renderShareActions(event)}
        </div>
      </article>
    `;
  }

  function renderShareDemo(event) {
    if (!shareDemoCard || !event) return;
    shareDemoCard.innerHTML = `
      <div class="share-proof-card">
        <span>${escapeHtml(event.category)}</span>
        <h3>${escapeHtml(event.title)}</h3>
        <p>${escapeHtml(eventImpactText(event))}</p>
        <a href="${eventHref(event)}">Proof page</a>
      </div>
      ${renderShareActions(event)}
    `;
  }

  function renderPastEventShowcase() {
    const pastEvents = shareablePastEvents(allDashboardEvents());
    if (pastEventShowcase) {
      pastEventShowcase.innerHTML = pastEvents.length
        ? pastEvents.map(renderPastEventCard).join("")
        : '<p class="empty-state browse-empty">Completed and past events will appear here.</p>';
    }
    renderShareDemo(pastEvents[0] || seedEvents.find((event) => event.status === "completed"));
  }

  function renderLocalPosts() {
    const submissions = readStored(storage.submissions);
    pendingEvents.textContent = "";

    if (!submissions.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No events created yet.";
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
      const sourceLabel = submission.source === "org" ? "approved organization" : "one-off prototype event";
      const capacityLabel = submission.maxParticipants ? `capacity ${submission.maxParticipants}` : "";
      const locationLabel = [
        submission.location,
        submission.city,
        submission.zip
      ].filter(Boolean).join(", ");
      detail.textContent = [
        submission.category,
        locationLabel,
        capacityLabel,
        sourceLabel,
        submission.source === "org" ? "listed now" : "listed in this browser"
      ].filter(Boolean).join(" · ");

      const link = document.createElement("a");
      link.href = eventHref(localEvent);
      link.textContent = "View event";

      item.append(title, detail, link);
      list.append(item);
    });
    pendingEvents.append(list);
  }

  function dashboardEventItem(event, extra) {
    return `
      <article class="dashboard-item">
        <a href="${eventHref(event)}">${escapeHtml(event.title)}</a>
        <span>${escapeHtml(event.dateLabel)} · ${escapeHtml(event.locationName)}</span>
        ${extra ? `<span>${escapeHtml(extra)}</span>` : ""}
      </article>
    `;
  }

  function eventById(events, eventId) {
    return events.find((event) => event.id === eventId) || null;
  }

  function memberHref(member) {
    return window.BLUE_MOON_MEMBERS
      ? window.BLUE_MOON_MEMBERS.memberHref(member)
      : `member.html?id=${encodeURIComponent(normalizeEmail(member.email))}`;
  }

  function renderAccountList(title, eventsMarkup) {
    return `
      <section class="dashboard-card">
        <h3>${escapeHtml(title)}</h3>
        <div class="dashboard-list">
          ${eventsMarkup || '<p class="empty-state">Nothing here yet.</p>'}
        </div>
      </section>
    `;
  }

  function accountShareItem(event) {
    return `
      <article class="account-share-item">
        <div>
          <a href="${eventHref(event)}">${escapeHtml(event.title)}</a>
          <span>${escapeHtml(eventImpactText(event))}</span>
        </div>
        ${renderShareActions(event, true)}
      </article>
    `;
  }

  function renderAccountShowcase(eventsMarkup) {
    return `
      <section class="account-showcase">
        <div>
          <h3>Your good to share</h3>
          <p>Past events tied to this email become proof links for social and group chats.</p>
        </div>
        <div class="account-share-list">
          ${eventsMarkup || '<p class="empty-state">Past good actions you joined or organized will appear here.</p>'}
        </div>
        <p class="share-status" role="status"></p>
      </section>
    `;
  }

  function renderAccountDashboard() {
    if (!accountDashboard) return;
    const account = activeAccount();
    if (!account) {
      accountDashboard.innerHTML = '<p class="empty-state">Sign in to see the events you joined and the events you are organizing.</p>';
      return;
    }

    const accountEmail = normalizeEmail(account.email);
    const events = allDashboardEvents();
    const joins = readStored(storage.joins)
      .filter((join) => normalizeEmail(join.email) === accountEmail)
      .map((join) => ({
        join,
        event: eventById(events, join.eventId)
      }))
      .filter((item) => item.event);
    const organized = events.filter((event) => normalizeEmail(event.organizerEmail) === accountEmail);

    const joinedMarkup = joins
      .map(({ join, event }) => dashboardEventItem(event, join.visibility === "public" ? "Public on event page" : "Private on event page"))
      .join("");
    const organizedMarkup = organized
      .map((event) => dashboardEventItem(event, `${event.participantCount + localJoinCount(event.id)}${event.maxParticipants ? ` of ${event.maxParticipants}` : ""} joining`))
      .join("");
    const accountShowcaseMarkup = shareablePastEvents([
      ...joins.map(({ event }) => event),
      ...organized
    ])
      .map(accountShareItem)
      .join("");

    accountDashboard.innerHTML = `
      <div class="account-summary">
        <div>
          <strong>${escapeHtml(account.name)}</strong>
          <span>${escapeHtml(account.email)}</span>
        </div>
        <button class="text-button" type="button" data-account-action="sign-out">Sign out</button>
      </div>
      <div class="dashboard-grid">
        ${renderAccountList("Joined", joinedMarkup)}
        ${renderAccountList("Organizing", organizedMarkup)}
      </div>
      ${renderAccountShowcase(accountShowcaseMarkup)}
    `;
  }

  function mergeMember(profileMap, member) {
    const email = normalizeEmail(member.email);
    if (!email) return;
    const existing = profileMap.get(email) || {
      name: member.name || email,
      email,
      sources: new Set()
    };
    if (member.name && (!existing.name || existing.name === email)) existing.name = member.name;
    if (member.source) existing.sources.add(member.source);
    profileMap.set(email, existing);
  }

  function memberProfiles(events) {
    const profiles = new Map();
    if (window.BLUE_MOON_ACCOUNT && window.BLUE_MOON_ACCOUNT.allAccounts) {
      window.BLUE_MOON_ACCOUNT.allAccounts().forEach((account) => {
        mergeMember(profiles, { ...account, source: "account" });
      });
    }
    readStored(storage.joins).forEach((join) => {
      mergeMember(profiles, { name: join.name, email: join.email, source: "joined" });
    });
    events.forEach((event) => {
      mergeMember(profiles, { name: event.organizer, email: event.organizerEmail, source: "organizer" });
    });
    return Array.from(profiles.values()).map((profile) => ({
      ...profile,
      sources: Array.from(profile.sources)
    }));
  }

  function renderMemberResults(query) {
    if (!memberResults) return;
    const search = String(query || "").trim().toLowerCase();
    if (!search) {
      memberResults.innerHTML = '<p class="empty-state">Search by name or email to look up a member.</p>';
      return;
    }

    const events = allDashboardEvents();
    const matches = memberProfiles(events).filter((member) => {
      return member.name.toLowerCase().includes(search) || member.email.toLowerCase().includes(search);
    });

    if (!matches.length) {
      memberResults.innerHTML = '<p class="empty-state">No matching member found in this browser yet.</p>';
      return;
    }

    memberResults.innerHTML = matches.map((member) => {
      const joined = readStored(storage.joins)
        .filter((join) => normalizeEmail(join.email) === member.email)
        .map((join) => eventById(events, join.eventId))
        .filter(Boolean);
      const organized = events.filter((event) => normalizeEmail(event.organizerEmail) === member.email);
      const joinedMarkup = joined.map((event) => dashboardEventItem(event, "Joined")).join("");
      const organizedMarkup = organized.map((event) => dashboardEventItem(event, "Organizing")).join("");
      return `
        <article class="member-card">
          <div>
            <a class="member-name-link" href="${memberHref(member)}">${escapeHtml(member.name)}</a>
            <span>${escapeHtml(member.email)}</span>
          </div>
          <span>${member.sources.map((source) => escapeHtml(source)).join(" · ")}</span>
          <div class="dashboard-grid">
            ${renderAccountList("Joined", joinedMarkup)}
            ${renderAccountList("Organizing", organizedMarkup)}
          </div>
        </article>
      `;
    }).join("");
  }

  function updateAccountFormMode() {
    if (!accountAction || !accountNameField || !accountSubmit) return;
    const isCreate = accountAction.value === "create";
    accountNameField.hidden = !isCreate;
    const nameInput = accountNameField.querySelector("input");
    if (nameInput) nameInput.required = isCreate;
    accountSubmit.textContent = isCreate ? "Create account" : "Sign in";
  }

  function prefillAccountFields() {
    const account = activeAccount();
    if (!account) return;
    if (eventForm) {
      if (eventForm.elements.organizer && !eventForm.elements.organizer.value) eventForm.elements.organizer.value = account.name;
      if (eventForm.elements.email && !eventForm.elements.email.value) eventForm.elements.email.value = account.email;
    }
    if (waitlistForm) {
      if (waitlistForm.elements.name && !waitlistForm.elements.name.value) waitlistForm.elements.name.value = account.name;
      if (waitlistForm.elements.email && !waitlistForm.elements.email.value) waitlistForm.elements.email.value = account.email;
    }
    if (orgForm) {
      if (orgForm.elements.contactName && !orgForm.elements.contactName.value) orgForm.elements.contactName.value = account.name;
      if (orgForm.elements.email && !orgForm.elements.email.value) orgForm.elements.email.value = account.email;
    }
  }

  function updateOrgPostControls() {
    if (!postMode || !orgField || !orgSelect) return;
    const isOrgPost = postMode.value === "organization";
    orgField.hidden = !isOrgPost;
    orgSelect.disabled = !isOrgPost;
  }

  function setFormField(name, value) {
    const field = eventForm ? eventForm.elements[name] : null;
    if (!field || value === undefined) return;
    field.value = value;
  }

  function applyTemplate() {
    if (!eventTemplate || !eventForm) return;
    const template = templates[eventTemplate.value] || templates.custom;
    if (templateHint) templateHint.textContent = template.hint;
    if (eventTemplate.value === "custom") return;
    setFormField("title", template.title);
    setFormField("category", template.category);
    setFormField("startTime", template.startTime);
    setFormField("maxParticipants", template.suggestedCapacity);
    setFormField("description", template.description);
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
        ? `${organization.contactName} · approved · can create events`
        : `${organization.contactName} · pending maintainer review`;

      item.append(title, detail);

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

  function setShowcaseTab(name) {
    showcaseTabs.forEach((tab) => {
      const isActive = tab.getAttribute("data-showcase-tab") === name;
      tab.classList.toggle("active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
    });
    showcasePanels.forEach((panel) => {
      const isActive = panel.getAttribute("data-showcase-panel") === name;
      panel.classList.toggle("active", isActive);
      panel.hidden = !isActive;
    });
  }

  function sharePayload(button) {
    return {
      title: button.getAttribute("data-share-title") || "Blue Moon",
      text: button.getAttribute("data-share-text") || "",
      url: button.getAttribute("data-share-url") || window.location.href
    };
  }

  function setShareStatus(message) {
    document.querySelectorAll(".share-status").forEach((status) => {
      status.textContent = message;
    });
  }

  async function copyShareText(payload) {
    const value = `${payload.text}\n${payload.url}`.trim();
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.top = "-999px";
    document.body.append(field);
    field.select();
    document.execCommand("copy");
    field.remove();
  }

  async function handleShareButtonClick(event) {
    const button = event.target.closest("[data-copy-share], [data-native-share], [data-open-social]");
    if (!button) return;
    const payload = sharePayload(button);
    if (button.hasAttribute("data-native-share") && navigator.share) {
      try {
        await navigator.share(payload);
        setShareStatus("Share sheet opened.");
      } catch (error) {
        setShareStatus("Share cancelled.");
      }
      return;
    }

    try {
      await copyShareText(payload);
      setShareStatus("Proof link copied.");
    } catch (error) {
      setShareStatus("Could not copy the proof link.");
    }

    const social = button.getAttribute("data-open-social");
    if (social === "instagram") window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
    if (social === "tiktok") window.open("https://www.tiktok.com/upload", "_blank", "noopener,noreferrer");
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
        setNote("#event-form-note", "Choose an approved organization, or create this as a one-off event.");
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
      renderAccountDashboard();
      renderPastEventShowcase();
      setNote("#event-form-note", isOrgPost
        ? "Event created under the approved organization. People can browse and join it now."
        : "Event created in this browser. Production listings still need review before publishing.");
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
      setNote("#org-form-note", "Organization review requested. A maintainer must approve it before official posting.");
    });
  }

  if (postMode) {
    postMode.addEventListener("change", updateOrgPostControls);
  }

  if (eventTemplate) {
    eventTemplate.addEventListener("change", applyTemplate);
  }

  [locationFilter, categoryFilter, timeFilter].forEach((control) => {
    if (!control) return;
    control.addEventListener("input", renderEventCards);
    control.addEventListener("change", renderEventCards);
  });

  if (clearFilters) {
    clearFilters.addEventListener("click", () => {
      if (locationFilter) locationFilter.value = "";
      if (categoryFilter) categoryFilter.value = "all";
      if (timeFilter) timeFilter.value = "any";
      renderEventCards();
    });
  }

  showcaseTabs.forEach((tab) => {
    tab.addEventListener("click", () => setShowcaseTab(tab.getAttribute("data-showcase-tab")));
  });

  document.addEventListener("click", handleShareButtonClick);

  if (waitlistForm) {
    waitlistForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(waitlistForm).entries());
      if (data.website) {
        setNote("#waitlist-form-note", earlyAccessErrorMessage("bot_detected"));
        return;
      }
      setNote("#waitlist-form-note", site.backendEnabled ? "Saving early access request..." : "");
      const result = await sendEarlyAccessRequest(data);
      if (!result.ok) {
        setNote("#waitlist-form-note", earlyAccessErrorMessage(result.error));
        return;
      }
      const waitlist = readStored(storage.waitlist);
      waitlist.push({
        ...data,
        backendStatus: result.requestSaved ? "saved" : result.reason || "local_demo",
        notificationStatus: result.notificationSent ? "sent" : result.reason || "not_sent",
        createdAt: new Date().toISOString()
      });
      writeStored(storage.waitlist, waitlist);
      waitlistForm.reset();
      setNote("#waitlist-form-note", earlyAccessMessage(result));
    });
  }

  if (accountAction) {
    accountAction.addEventListener("change", updateAccountFormMode);
  }

  if (accountForm) {
    accountForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!window.BLUE_MOON_ACCOUNT) {
        setNote("#account-form-note", "Accounts are not available in this browser.");
        return;
      }

      const data = Object.fromEntries(new FormData(accountForm).entries());
      try {
        if (data.accountAction === "create") {
          await window.BLUE_MOON_ACCOUNT.createAccount(data);
          setNote("#account-form-note", "Account created. Your activity is below.");
        } else {
          await window.BLUE_MOON_ACCOUNT.signIn(data);
          setNote("#account-form-note", "Signed in. Your activity is below.");
        }
        accountForm.reset();
        updateAccountFormMode();
        renderAccountDashboard();
        prefillAccountFields();
      } catch (error) {
        setNote("#account-form-note", error.message || "Could not sign in.");
      }
    });
  }

  if (accountDashboard) {
    accountDashboard.addEventListener("click", (event) => {
      const action = event.target.getAttribute("data-account-action");
      if (action !== "sign-out" || !window.BLUE_MOON_ACCOUNT) return;
      window.BLUE_MOON_ACCOUNT.signOut();
      renderAccountDashboard();
      setNote("#account-form-note", "Signed out.");
    });
  }

  if (memberLookupForm) {
    memberLookupForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(memberLookupForm).entries());
      renderMemberResults(data.query);
    });
  }

  renderEventCards();
  renderCompletedCard();
  renderPastEventShowcase();
  renderLocalPosts();
  renderOrganizations();
  updateAccountFormMode();
  renderAccountDashboard();
  renderMemberResults("");
  prefillAccountFields();
  injectHomeStructuredData();
})();
