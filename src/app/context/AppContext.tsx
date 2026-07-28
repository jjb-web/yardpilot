import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type {
  User as SupabaseAuthUser,
} from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Project, User } from "../data/types";

type AppContextType = {
  user: User | null;
  authLoading: boolean;
  projects: Project[];
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  register: (user: User, password: string) => Promise<boolean>;
  addProject: (project: Project) => void;
  updateProject: (project: Project) => void;
  deleteProject: (id: string) => void;
};

type ProfileRow = {
  email: string | null;
  phone: string | null;
  full_name: string | null;
  company: string | null;
};

const AppContext = createContext<AppContextType | null>(null);

const SEED_PROJECTS: Project[] = [
  {
    id: "p1",
    name: "Hartwell Backyard Redesign",
    client: "Mark Hartwell",
    address: "822 Elmwood Dr, Austin TX",
    status: "active",
    projectType: "Landscape Design",
    squareFootage: 2400,
    laborRate: 65,
    laborHours: 28,
    lineItems: [
      {
        id: "l1",
        description: "Sod (Zoysia)",
        qty: 2400,
        unit: "sq ft",
        unitCost: 0.55,
      },
      {
        id: "l2",
        description: "Mulch delivery",
        qty: 8,
        unit: "yards",
        unitCost: 45,
      },
      {
        id: "l3",
        description: "Native shrubs",
        qty: 12,
        unit: "each",
        unitCost: 38,
      },
    ],
    aiEstimate:
      "Based on project scope, estimated total is $4,280–$4,680. Labor accounts for approximately 42% of the cost. Sod installation is the largest material line item. Consider scheduling irrigation assessment before sod delivery.",
    totalEstimate: 4480,
    notes:
      "Client prefers drought-tolerant plants. Check HOA restrictions.",
    createdAt: "2025-07-01T09:00:00Z",
    updatedAt: "2025-07-15T14:30:00Z",
  },
  {
    id: "p2",
    name: "Patel Driveway & Front Beds",
    client: "Priya Patel",
    address: "301 Magnolia Ln, Round Rock TX",
    status: "active",
    projectType: "Hardscaping",
    squareFootage: 900,
    laborRate: 70,
    laborHours: 16,
    lineItems: [
      {
        id: "l4",
        description: "Concrete pavers",
        qty: 900,
        unit: "sq ft",
        unitCost: 4.2,
      },
      {
        id: "l5",
        description: "Edging / border",
        qty: 120,
        unit: "lin ft",
        unitCost: 3.5,
      },
    ],
    aiEstimate:
      "Hardscaping job with moderate complexity. Estimate range $5,000–$5,500. Recommend 10% contingency for sub-base grading surprises.",
    totalEstimate: 5240,
    notes:
      "Pavers must match existing driveway color (sandstone).",
    createdAt: "2025-07-10T08:00:00Z",
    updatedAt: "2025-07-20T11:00:00Z",
  },
  {
    id: "p3",
    name: "Riverside HOA Common Area",
    client: "Riverside HOA",
    address: "100 Riverside Blvd, Cedar Park TX",
    status: "completed",
    projectType: "Lawn Maintenance",
    squareFootage: 12000,
    laborRate: 55,
    laborHours: 48,
    lineItems: [
      {
        id: "l6",
        description: "Fertilizer application",
        qty: 12000,
        unit: "sq ft",
        unitCost: 0.08,
      },
      {
        id: "l7",
        description: "Weed control",
        qty: 12000,
        unit: "sq ft",
        unitCost: 0.05,
      },
    ],
    aiEstimate:
      "Routine maintenance scope. Total estimated at $3,900. High labor portion reflects large area mow and trim cycles.",
    totalEstimate: 3900,
    notes:
      "Recurring monthly contract, April–October.",
    createdAt: "2025-04-01T07:00:00Z",
    updatedAt: "2025-06-30T16:00:00Z",
  },
];

function load<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function userFromAuth(authUser: SupabaseAuthUser): User {
  const metadata = authUser.user_metadata ?? {};

  return {
    name:
      metadata.full_name ??
      metadata.name ??
      authUser.email?.split("@")[0] ??
      "YardPilot User",
    email: authUser.email ?? "",
    company: metadata.company ?? "",
    phone: metadata.phone ?? authUser.phone ?? "",
  };
}

function userFromProfile(
  authUser: SupabaseAuthUser,
  profile: ProfileRow
): User {
  const fallback = userFromAuth(authUser);

  return {
    name: profile.full_name || fallback.name,
    email: profile.email || fallback.email,
    company: profile.company || fallback.company,
    phone: profile.phone || fallback.phone,
  };
}

export function AppProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>(() =>
    load("ls_projects", SEED_PROJECTS)
  );

  useEffect(() => {
    localStorage.setItem(
      "ls_projects",
      JSON.stringify(projects)
    );
  }, [projects]);

  useEffect(() => {
    if (user) {
      localStorage.setItem("ls_user", JSON.stringify(user));
    } else {
      localStorage.removeItem("ls_user");
    }
  }, [user]);

  useEffect(() => {
    let mounted = true;

    async function loadProfile(authUser: SupabaseAuthUser) {
      const fallbackUser = userFromAuth(authUser);

      if (mounted) {
        setUser(fallbackUser);
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("email, phone, full_name, company")
        .eq("id", authUser.id)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        console.error(
          "Could not load the user's profile:",
          error.message
        );
        return;
      }

      if (data) {
        setUser(
          userFromProfile(
            authUser,
            data as ProfileRow
          )
        );
      }
    }

    async function initializeAuth() {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (error) {
        console.error(
          "Could not restore the Supabase session:",
          error.message
        );
        setUser(null);
        setAuthLoading(false);
        return;
      }

      if (session?.user) {
        await loadProfile(session.user);
      } else {
        setUser(null);
      }

      if (mounted) {
        setAuthLoading(false);
      }
    }

    void initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;

        if (event === "SIGNED_OUT" || !session?.user) {
          setUser(null);
          setAuthLoading(false);
          return;
        }

        // Set a usable user immediately so protected routes can render.
        setUser(userFromAuth(session.user));
        setAuthLoading(false);

        // Run the database lookup outside the auth callback.
        window.setTimeout(() => {
          if (mounted) {
            void loadProfile(session.user);
          }
        }, 0);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function login(
    email: string,
    password: string
  ): Promise<boolean> {
    const { error } =
      await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

    return !error;
  }

  async function logout(): Promise<void> {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Could not sign out:", error.message);
      return;
    }

    setUser(null);
  }

  async function register(
    newUser: User,
    password: string
  ): Promise<boolean> {
    const { error } = await supabase.auth.signUp({
      email: newUser.email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login?confirmed=true`,
        data: {
          full_name: newUser.name,
          company: newUser.company,
          phone: newUser.phone,
        },
      },
    });

    return !error;
  }

  function addProject(project: Project) {
    setProjects((previous) => [project, ...previous]);
  }

  function updateProject(project: Project) {
    setProjects((previous) =>
      previous.map((item) =>
        item.id === project.id ? project : item
      )
    );
  }

  function deleteProject(id: string) {
    setProjects((previous) =>
      previous.filter((item) => item.id !== id)
    );
  }

  return (
    <AppContext.Provider
      value={{
        user,
        authLoading,
        projects,
        login,
        logout,
        register,
        addProject,
        updateProject,
        deleteProject,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error(
      "useApp must be used within AppProvider"
    );
  }

  return context;
}