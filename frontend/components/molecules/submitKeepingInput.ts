import type { FormEvent } from "react";

/**
 * A form submit handler that hands the form's data to `handler` WITHOUT the
 * reset React 19 applies after a `<form action={fn}>` submission.
 *
 * That reset is right for a form that succeeded and is about to close, and
 * wrong for one the server refused: the dialog said "Fix the highlighted
 * fields" over inputs it had just emptied, with the Kind flipped back to its
 * default. Every dialog that can come back with field errors submits through
 * this instead.
 */
export function submitKeepingInput(handler: (data: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    handler(new FormData(event.currentTarget, submitter));
  };
}
