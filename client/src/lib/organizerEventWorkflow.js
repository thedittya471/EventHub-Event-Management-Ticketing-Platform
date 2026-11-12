function tagWorkflowError(error, workflowStage, eventId) {
  const taggedError = error instanceof Error ? error : new Error(String(error));

  taggedError.workflowStage = workflowStage;

  if (eventId) {
    taggedError.eventId = eventId;
  }

  return taggedError;
}

export async function saveOrganizerEvent({
  api,
  payload,
  eventId,
  publish,
  navigate,
}) {
  const creating = !eventId;
  let savedEvent;

  // First save or update the existing draft.
  try {
    const result = creating
      ? await api('/organizer/events', {
          method: 'POST',
          body: payload,
        })
      : await api(`/organizer/events/${eventId}`, {
          method: 'PATCH',
          body: payload,
        });

    savedEvent = result.data;
  } catch (error) {
    throw tagWorkflowError(error, 'save');
  }

  if (!savedEvent?.id) {
    const error = new Error('The server did not return a valid event ID.');
    error.workflowStage = 'save';
    throw error;
  }

  // Preserve the draft URL immediately after successful creation.
  if (creating) {
    navigate(`/organizer/events/${savedEvent.id}/edit`, {
      replace: true,
    });
  }

  // Publishing is a separate operation.
  if (publish) {
    try {
      await api(`/organizer/events/${savedEvent.id}/publish`, {
        method: 'POST',
      });
    } catch (error) {
      throw tagWorkflowError(error, 'publish', savedEvent.id);
    }
  }

  navigate(`/organizer/events/${savedEvent.id}`, {
    replace: true,
    state: {
      notice: publish
        ? 'Event published successfully.'
        : creating
          ? 'Draft created successfully.'
          : 'Event changes saved.',
    },
  });

  return savedEvent;
}
