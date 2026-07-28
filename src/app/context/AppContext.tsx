import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  User as SupabaseAuthUser,
} from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type {
  LineItem,
  Project,
  ProjectStatus,
  User,
} from "../data/types";

type AppContextType = {
  user: User | null;
  authLoading: boolean;
  projects: Project[];
  projectsLoading: boolean;
  projectsError: string;
  login: (
    email: string,
    password: string
  ) => Promise<boolean>;
  logout: () => Promise<void>;
  register: (
    user: User,
    password: string
  ) => Promise<boolean>;
  refreshProjects: () => Promise<void>;
  addProject: (project: Project) => Promise<Project>;
  updateProject: (project: Project) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
};

type ProfileRow = {
  email: string | null;
  phone: string | null;
  full_name: string | null;
  company: string | null;
};

type ProjectRow = {
  id: string;
  user_id: string;
  name: string;
  client: string;
  address: string;
  status: ProjectStatus;
  project_type: string;
  square_footage: number | string;
  labor_rate: number | string;
  labor_hours: number | string;
  line_items: unknown;
  estimate_summary: string | null;
  total_estimate: number | string;
  notes: string;
  created_at: string;
  updated_at: string;
};

const AppContext = createContext<AppContextType | null>(
  null
);

function userFromAuth(
  authUser: SupabaseAuthUser
): User {
  const metadata = authUser.user_metadata ?? {};

  return {
    name:
      metadata.full_name ??
      metadata.name ??
      authUser.email?.split("@")[0] ??
      "YardPilot User",
    email: authUser.email ?? "",
    company: metadata.company ?? "",
    phone:
      metadata.phone ??
      authUser.phone ??
      "",
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

function normalizeLineItems(
  value: unknown
): LineItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item, index) => {
    const candidate =
      typeof item === "object" && item !== null
        ? (item as Partial<LineItem>)
        : {};

    return {
      id:
        typeof candidate.id === "string"
          ? candidate.id
          : `line-${index}`,
      description:
        typeof candidate.description === "string"
          ? candidate.description
          : "",
      qty: Number(candidate.qty ?? 0),
      unit:
        typeof candidate.unit === "string"
          ? candidate.unit
          : "each",
      unitCost: Number(candidate.unitCost ?? 0),
    };
  });
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    client: row.client,
    address: row.address,
    status: row.status,
    projectType: row.project_type,
    squareFootage: Number(row.square_footage),
    laborRate: Number(row.labor_rate),
    laborHours: Number(row.labor_hours),
    lineItems: normalizeLineItems(row.line_items),
    aiEstimate: row.estimate_summary,
    totalEstimate: Number(row.total_estimate),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function projectToDatabase(
  project: Project,
  userId: string
) {
  return {
    id: project.id,
    user_id: userId,
    name: project.name,
    client: project.client,
    address: project.address,
    status: project.status,
    project_type: project.projectType,
    square_footage: project.squareFootage,
    labor_rate: project.laborRate,
    labor_hours: project.laborHours,
    line_items: project.lineItems,
    estimate_summary: project.aiEstimate,
    total_estimate: project.totalEstimate,
    notes: project.notes,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
  };
}

function projectUpdates(project: Project) {
  return {
    name: project.name,
    client: project.client,
    address: project.address,
    status: project.status,
    project_type: project.projectType,
    square_footage: project.squareFootage,
    labor_rate: project.laborRate,
    labor_hours: project.laborHours,
    line_items: project.lineItems,
    estimate_summary: project.aiEstimate,
    total_estimate: project.totalEstimate,
    notes: project.notes,
    updated_at: project.updatedAt,
  };
}

export function AppProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [user, setUser] = useState<User | null>(
    null
  );
  const [authLoading, setAuthLoading] =
    useState(true);
  const [projects, setProjects] = useState<
    Project[]
  >([]);
  const [projectsLoading, setProjectsLoading] =
    useState(false);
  const [projectsError, setProjectsError] =
    useState("");

  const authUserIdRef = useRef<string | null>(
    null
  );
  const authRequestRef = useRef(0);

  function clearAccount() {
    authRequestRef.current += 1;
    authUserIdRef.current = null;
    setUser(null);
    setProjects([]);
    setProjectsError("");
    setProjectsLoading(false);
    setAuthLoading(false);

    // Remove the old Figma demo data if it still
    // exists in this browser.
    localStorage.removeItem("ls_projects");
    localStorage.removeItem("ls_user");
    localStorage.removeItem("ls_registered");
  }

  async function loadProfile(
    authUser: SupabaseAuthUser,
    requestId: number
  ) {
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "email, phone, full_name, company"
      )
      .eq("id", authUser.id)
      .maybeSingle();

    if (
      requestId !== authRequestRef.current
    ) {
      return;
    }

    if (error) {
      console.error(
        "Could not load profile:",
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

  async function loadProjects(
    userId: string,
    requestId: number
  ) {
    setProjectsLoading(true);
    setProjectsError("");

    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", {
        ascending: false,
      });

    if (
      requestId !== authRequestRef.current
    ) {
      return;
    }

    if (error) {
      setProjects([]);
      setProjectsError(error.message);
      setProjectsLoading(false);
      return;
    }

    const loadedProjects = (
      (data ?? []) as ProjectRow[]
    ).map(rowToProject);

    setProjects(loadedProjects);
    setProjectsLoading(false);
  }

  async function loadAccount(
    authUser: SupabaseAuthUser
  ) {
    const requestId =
      ++authRequestRef.current;

    authUserIdRef.current = authUser.id;
    setAuthLoading(true);
    setUser(userFromAuth(authUser));
    setProjects([]);

    await Promise.all([
      loadProfile(authUser, requestId),
      loadProjects(authUser.id, requestId),
    ]);

    if (
      requestId === authRequestRef.current
    ) {
      setAuthLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function initializeAuth() {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      if (error) {
        console.error(
          "Could not restore session:",
          error.message
        );
        clearAccount();
        return;
      }

      if (session?.user) {
        await loadAccount(session.user);
      } else {
        clearAccount();
      }
    }

    void initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) {
          return;
        }

        if (
          event === "SIGNED_OUT" ||
          !session?.user
        ) {
          clearAccount();
          return;
        }

        if (
          event === "INITIAL_SESSION" ||
          event === "SIGNED_IN" ||
          event === "USER_UPDATED"
        ) {
          // Supabase recommends keeping this
          // callback quick. Load database data
          // immediately after the callback exits.
          window.setTimeout(() => {
            if (mounted) {
              void loadAccount(session.user);
            }
          }, 0);
        }
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
    const { error } =
      await supabase.auth.signOut();

    if (error) {
      throw new Error(error.message);
    }

    clearAccount();
  }

  async function register(
    newUser: User,
    password: string
  ): Promise<boolean> {
    const { error } =
      await supabase.auth.signUp({
        email: newUser.email.trim(),
        password,
        options: {
          emailRedirectTo:
            `${window.location.origin}` +
            "/login?confirmed=true",
          data: {
            full_name: newUser.name,
            company: newUser.company,
            phone: newUser.phone,
          },
        },
      });

    return !error;
  }

  async function refreshProjects() {
    const userId = authUserIdRef.current;

    if (!userId) {
      setProjects([]);
      return;
    }

    const requestId =
      authRequestRef.current;

    await loadProjects(userId, requestId);
  }

  async function addProject(
    project: Project
  ): Promise<Project> {
    const userId = authUserIdRef.current;

    if (!userId) {
      throw new Error(
        "You must be signed in to save an estimate."
      );
    }

    setProjectsError("");

    const { data, error } = await supabase
      .from("projects")
      .insert(
        projectToDatabase(project, userId)
      )
      .select("*")
      .single();

    if (error) {
      setProjectsError(error.message);
      throw new Error(error.message);
    }

    const savedProject = rowToProject(
      data as ProjectRow
    );

    setProjects((previous) => [
      savedProject,
      ...previous.filter(
        (item) => item.id !== savedProject.id
      ),
    ]);

    return savedProject;
  }

  async function updateProject(
    project: Project
  ): Promise<Project> {
    const userId = authUserIdRef.current;

    if (!userId) {
      throw new Error(
        "You must be signed in to update an estimate."
      );
    }

    setProjectsError("");

    const { data, error } = await supabase
      .from("projects")
      .update(projectUpdates(project))
      .eq("id", project.id)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error) {
      setProjectsError(error.message);
      throw new Error(error.message);
    }

    const savedProject = rowToProject(
      data as ProjectRow
    );

    setProjects((previous) =>
      previous.map((item) =>
        item.id === savedProject.id
          ? savedProject
          : item
      )
    );

    return savedProject;
  }

  async function deleteProject(
    id: string
  ): Promise<void> {
    const userId = authUserIdRef.current;

    if (!userId) {
      throw new Error(
        "You must be signed in to delete a project."
      );
    }

    setProjectsError("");

    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      setProjectsError(error.message);
      throw new Error(error.message);
    }

    setProjects((previous) =>
      previous.filter(
        (project) => project.id !== id
      )
    );
  }

  return (
    <AppContext.Provider
      value={{
        user,
        authLoading,
        projects,
        projectsLoading,
        projectsError,
        login,
        logout,
        register,
        refreshProjects,
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