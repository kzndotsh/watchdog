/** Whether public email sign-up is open (`/api/signup-allowed`; a failure reads as closed). */
export async function getAllowSignup(): Promise<boolean> {
  const response = await fetch("/api/signup-allowed");
  if (!response.ok) return false;
  const body: unknown = await response.json();
  return (
    typeof body === "object" &&
    body !== null &&
    "allowSignup" in body &&
    body.allowSignup === true
  );
}
