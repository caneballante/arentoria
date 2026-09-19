import Link from "next/link";

export default function NotFound() {
  return (
    <main className="fatal-state">
      <span>Arentoria civic archive</span>
      <h1>That record is not in the current index.</h1>
      <Link href="/">Return to the city map</Link>
    </main>
  );
}
