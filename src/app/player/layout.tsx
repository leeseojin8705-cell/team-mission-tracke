import type { ReactNode } from "react";
import { PlayerChrome } from "./PlayerChrome";

export default function PlayerLayout({ children }: { children: ReactNode }) {
  return <PlayerChrome>{children}</PlayerChrome>;
}
