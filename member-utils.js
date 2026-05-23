(function () {
  const storage = {
    joins: "blueMoonJoins",
    submissions: "blueMoonEventSubmissions"
  };

  function readStored(key) {
    try {
      return JSON.parse(localStorage.getItem(key)) || [];
    } catch (error) {
      return [];
    }
  }

  function normalizeEmail(value) {
    return window.BLUE_MOON_ACCOUNT
      ? window.BLUE_MOON_ACCOUNT.normalizeEmail(value)
      : String(value || "").trim().toLowerCase();
  }

  function memberId(email) {
    return btoa(normalizeEmail(email)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function emailFromMemberId(id) {
    try {
      const padded = String(id || "").replace(/-/g, "+").replace(/_/g, "/");
      return atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
    } catch (error) {
      return "";
    }
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

  function submissionId(submission, index) {
    if (submission.id) return submission.id;
    const created = Date.parse(submission.createdAt || "");
    const suffix = Number.isNaN(created) ? index : created;
    return `local-${slugify(submission.title)}-${suffix}`;
  }

  function submissionToEvent(submission, index) {
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
      maxParticipants: Number(submission.maxParticipants) || null,
      summary: submission.description || "A community-created event on Blue Moon.",
      source: submission.source || "one-off"
    };
  }

  function allEvents() {
    return [
      ...(window.BLUE_MOON_EVENTS || []),
      ...readStored(storage.submissions).map(submissionToEvent)
    ];
  }

  function localPageHref(pageName, id) {
    const query = `?id=${encodeURIComponent(id)}`;
    return window.location.protocol === "file:" ? `${pageName}${query}` : `/${pageName}${query}`;
  }

  function eventHref(event) {
    const isLocal = ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
    if (isLocal) return localPageHref("event.html", event.id);
    return `/events/${encodeURIComponent(event.id)}`;
  }

  function memberHref(member) {
    const id = memberId(member.email);
    const isLocal = ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
    return isLocal ? localPageHref("member.html", id) : `/members/${encodeURIComponent(id)}`;
  }

  function members() {
    const profiles = new Map();
    const merge = (member) => {
      const email = normalizeEmail(member.email);
      if (!email) return;
      const existing = profiles.get(email) || {
        name: member.name || email,
        email,
        sources: new Set()
      };
      if (member.name && (!existing.name || existing.name === email)) existing.name = member.name;
      if (member.source) existing.sources.add(member.source);
      profiles.set(email, existing);
    };

    if (window.BLUE_MOON_ACCOUNT && window.BLUE_MOON_ACCOUNT.allAccounts) {
      window.BLUE_MOON_ACCOUNT.allAccounts().forEach((account) => merge({ ...account, source: "account" }));
    }
    readStored(storage.joins).forEach((join) => merge({ name: join.name, email: join.email, source: "joined" }));
    allEvents().forEach((event) => merge({ name: event.organizer, email: event.organizerEmail, source: "organizer" }));

    return Array.from(profiles.values()).map((member) => ({
      ...member,
      id: memberId(member.email),
      sources: Array.from(member.sources)
    }));
  }

  function profileForEmail(email) {
    const normalizedEmail = normalizeEmail(email);
    const events = allEvents();
    const joins = readStored(storage.joins).filter((join) => normalizeEmail(join.email) === normalizedEmail);
    const joined = joins
      .map((join) => ({
        join,
        event: events.find((event) => event.id === join.eventId)
      }))
      .filter((item) => item.event);
    const organized = events.filter((event) => normalizeEmail(event.organizerEmail) === normalizedEmail);
    const member = members().find((candidate) => candidate.email === normalizedEmail);
    const completedEventIds = new Set();
    joined.forEach((item) => {
      if (item.event.status === "completed") completedEventIds.add(item.event.id);
    });
    organized.forEach((event) => {
      if (event.status === "completed") completedEventIds.add(event.id);
    });
    const activityEvents = new Map();
    joined.forEach((item) => activityEvents.set(item.event.id, item.event));
    organized.forEach((event) => activityEvents.set(event.id, event));
    const goodTypes = Array.from(activityEvents.values())
      .reduce((types, event) => {
        const category = event.category || "Community help";
        types.set(category, (types.get(category) || 0) + 1);
        return types;
      }, new Map());

    return {
      ...(member || { id: memberId(normalizedEmail), name: normalizedEmail, email: normalizedEmail, sources: [] }),
      joined,
      goodTypes: Array.from(goodTypes.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((first, second) => second.count - first.count || first.category.localeCompare(second.category)),
      organized,
      stats: {
        joinedCount: joined.length,
        organizedCount: organized.length,
        completedCount: completedEventIds.size
      }
    };
  }

  window.BLUE_MOON_MEMBERS = {
    emailFromMemberId,
    eventHref,
    memberHref,
    memberId,
    members,
    normalizeEmail,
    profileForEmail
  };
})();
