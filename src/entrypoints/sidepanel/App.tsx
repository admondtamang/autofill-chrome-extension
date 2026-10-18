import * as React from "react";
import { useEffect, useRef } from "react";
import { Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { useSession } from "./hooks/useSession";
import { useProfile } from "./hooks/useProfile";
import { useFill } from "./hooks/useFill";
import { LoginScreen } from "./screens/LoginScreen";
import { SearchScreen } from "./screens/SearchScreen";
import { UserDataScreen } from "./screens/UserDataScreen";
import type { RecordType } from "@/shared/contracts/recordType";
import type { ApplicantProfile } from "@/shared/types/applicantProfile";

type Screen = "login" | "search" | "userdata";

export function App() {
  const { session, loading: sessionLoading, login, logout } = useSession();
  const {
    profile,
    recordType,
    loading: profileLoading,
    selectClient,
    clearClient,
  } = useProfile();
  const { fillReport, filling, fillAll, clickToFill, startDrag } = useFill();

  const [screen, setScreen] = React.useState<Screen>("login");
  const searchFocusRef = useRef<HTMLElement | null>(null);

  // Route based on session state
  useEffect(() => {
    if (sessionLoading) return;
    if (session) {
      setScreen((prev) => (prev === "login" ? "search" : prev));
    } else {
      setScreen("login");
    }
  }, [session, sessionLoading]);

  const handleLoginSuccess = () => {
    setScreen("search");
  };

  // Move focus to search input after login
  useEffect(() => {
    if (screen === "search") {
      searchFocusRef.current?.focus();
    }
  }, [screen]);

  const handleSelectClient = async (
    rt: RecordType,
    id: number,
    transform: (row: unknown) => ApplicantProfile,
  ) => {
    await selectClient(rt, id, transform);
    setScreen("userdata");
  };

  const handleChangeClient = () => {
    clearClient();
    setScreen("search");
  };

  const handleLogout = async () => {
    await logout();
    clearClient();
    setScreen("login");
  };

  if (sessionLoading) {
    return (
      <div className="flex flex-col h-screen">
        <header className="p-3 border-b text-sm font-medium">ImmiFill</header>
        <main className="flex-1 flex items-center justify-center" aria-busy="true">
          <p className="text-muted-foreground text-sm">
            Loading…
          </p>
        </main>
        <Toaster position="bottom-center" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center justify-between p-3 border-b flex-shrink-0">
        <span className="text-sm font-semibold">ImmiFill</span>
        {session && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {session.user.firstName} {session.user.lastName}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={handleLogout}
              aria-label="Log out"
            >
              Logout
            </Button>
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {screen === "login" && (
          <LoginScreen login={login} onSuccess={handleLoginSuccess} />
        )}

        {screen === "search" && session && (
          <SearchScreen
            onSelectClient={handleSelectClient}
            focusRef={searchFocusRef}
          />
        )}

        {screen === "userdata" && profile && recordType && (
          <UserDataScreen
            profile={profile}
            recordType={recordType}
            fillReport={fillReport}
            filling={filling || profileLoading}
            onFillAll={(overwrite) => fillAll(profile, overwrite)}
            onClickToFill={clickToFill}
            onDragStart={startDrag}
            onChangeClient={handleChangeClient}
          />
        )}
      </main>

      <Toaster position="bottom-center" />
    </div>
  );
}
