import { redirect } from "next/navigation";

// Phase 8: previously this page held an in-memory `activeView` state for all
// 8 tabs. URL refresh lost the view and there were no deep links. Now each
// tab is its own route; the root just sends users to /dashboard.
export default function Home() {
  redirect("/dashboard");
}
