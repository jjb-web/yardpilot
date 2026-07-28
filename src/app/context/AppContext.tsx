import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { User as SupabaseAuthUser } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type {
  Contact,
  ContactActivity,
  ContactType,
  EstimateStatus,
  LineItem,
  Project,
  ProjectStatus,
  Property,
  PropertyPhoto,
  User,
} from "../data/types";

type AppContextType = {
  user: User | null;
  authLoading: boolean;

  projects: Project[];
  projectsLoading: boolean;
  projectsError: string;

  contacts: Contact[];
  contactsLoading: boolean;
  contactsError: string;

  properties: Property[];
  propertyPhotos: PropertyPhoto[];
  propertiesLoading: boolean;
  propertiesError: string;

  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  register: (user: User, password: string) => Promise<boolean>;

  refreshProjects: () => Promise<void>;
  addProject: (project: Project) => Promise<Project>;
  updateProject: (project: Project) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  setProjectSharing: (id: string, enabled: boolean) => Promise<Project>;

  refreshContacts: () => Promise<void>;
  addContact: (contact: Contact) => Promise<Contact>;
  updateContact: (contact: Contact) => Promise<Contact>;
  deleteContact: (id: string) => Promise<void>;

  refreshProperties: () => Promise<void>;
  addProperty: (property: Property) => Promise<Property>;
  updateProperty: (property: Property) => Promise<Property>;
  deleteProperty: (id: string) => Promise<void>;
  uploadPropertyPhoto: (
    propertyId: string,
    file: File,
    caption?: string
  ) => Promise<PropertyPhoto>;
  deletePropertyPhoto: (photo: PropertyPhoto) => Promise<void>;
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
  contact_id: string | null;
  property_id: string | null;
  status: ProjectStatus;
  estimate_status: EstimateStatus;
  estimate_number: string;
  issue_date: string;
  valid_until: string | null;
  project_type: string;
  square_footage: number | string;
  labor_rate: number | string;
  labor_hours: number | string;
  line_items: unknown;
  estimate_summary: string | null;
  scope_description: string;
  client_notes: string;
  terms: string;
  tax_rate: number | string;
  discount_amount: number | string;
  total_estimate: number | string;
  notes: string;
  share_token: string;
  share_enabled: boolean;
  created_at: string;
  updated_at: string;
};

type ContactRow = {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  contact_type: ContactType;
  activity_status: ContactActivity;
  source: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

type PropertyRow = {
  id: string;
  user_id: string;
  contact_id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  description: string;
  internal_notes: string;
  client_notes: string;
  created_at: string;
  updated_at: string;
};

type PropertyPhotoRow = {
  id: string;
  user_id: string;
  property_id: string;
  storage_path: string;
  caption: string;
  created_at: string;
};

const AppContext = createContext<AppContextType | null>(null);

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

function normalizeLineItems(value: unknown): LineItem[] {
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
    contactId: row.contact_id,
    propertyId: row.property_id,
    status: row.status,
    estimateStatus: row.estimate_status ?? "draft",
    estimateNumber: row.estimate_number ?? `EST-${row.id.slice(0, 8)}`,
    issueDate: row.issue_date ?? row.created_at.slice(0, 10),
    validUntil: row.valid_until,
    projectType: row.project_type,
    squareFootage: Number(row.square_footage),
    laborRate: Number(row.labor_rate),
    laborHours: Number(row.labor_hours),
    lineItems: normalizeLineItems(row.line_items),
    aiEstimate: row.estimate_summary,
    scopeDescription: row.scope_description ?? "",
    clientNotes: row.client_notes ?? "",
    terms: row.terms ?? "",
    taxRate: Number(row.tax_rate ?? 0),
    discountAmount: Number(row.discount_amount ?? 0),
    totalEstimate: Number(row.total_estimate),
    notes: row.notes,
    shareToken: row.share_token,
    shareEnabled: Boolean(row.share_enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToContact(row: ContactRow): Contact {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    city: row.city,
    state: row.state,
    zip: row.zip,
    contactType: row.contact_type,
    activityStatus: row.activity_status,
    source: row.source,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToProperty(row: PropertyRow): Property {
  return {
    id: row.id,
    contactId: row.contact_id,
    name: row.name,
    address: row.address,
    city: row.city,
    state: row.state,
    zip: row.zip,
    description: row.description,
    internalNotes: row.internal_notes,
    clientNotes: row.client_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function rowToPropertyPhoto(
  row: PropertyPhotoRow
): Promise<PropertyPhoto> {
  const { data, error } = await supabase.storage
    .from("property-photos")
    .createSignedUrl(row.storage_path, 60 * 60);

  return {
    id: row.id,
    propertyId: row.property_id,
    storagePath: row.storage_path,
    caption: row.caption,
    url: error ? "" : data.signedUrl,
    createdAt: row.created_at,
  };
}

function projectToDatabase(project: Project, userId: string) {
  return {
    id: project.id,
    user_id: userId,
    name: project.name,
    client: project.client,
    address: project.address,
    contact_id: project.contactId,
    property_id: project.propertyId,
    status: project.status,
    estimate_status: project.estimateStatus,
    estimate_number: project.estimateNumber,
    issue_date: project.issueDate,
    valid_until: project.validUntil || null,
    project_type: project.projectType,
    square_footage: project.squareFootage,
    labor_rate: project.laborRate,
    labor_hours: project.laborHours,
    line_items: project.lineItems,
    estimate_summary: project.aiEstimate,
    scope_description: project.scopeDescription,
    client_notes: project.clientNotes,
    terms: project.terms,
    tax_rate: project.taxRate,
    discount_amount: project.discountAmount,
    total_estimate: project.totalEstimate,
    notes: project.notes,
    share_token: project.shareToken,
    share_enabled: project.shareEnabled,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
  };
}

function projectUpdates(project: Project) {
  const { user_id: _userId, id: _id, created_at: _createdAt, ...updates } =
    projectToDatabase(project, "00000000-0000-0000-0000-000000000000");
  return updates;
}

function contactToDatabase(contact: Contact, userId: string) {
  return {
    id: contact.id,
    user_id: userId,
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    address: contact.address,
    city: contact.city,
    state: contact.state,
    zip: contact.zip,
    contact_type: contact.contactType,
    activity_status: contact.activityStatus,
    source: contact.source,
    notes: contact.notes,
    created_at: contact.createdAt,
    updated_at: contact.updatedAt,
  };
}

function contactUpdates(contact: Contact) {
  const { user_id: _userId, id: _id, created_at: _createdAt, ...updates } =
    contactToDatabase(contact, "00000000-0000-0000-0000-000000000000");
  return updates;
}

function propertyToDatabase(property: Property, userId: string) {
  return {
    id: property.id,
    user_id: userId,
    contact_id: property.contactId,
    name: property.name,
    address: property.address,
    city: property.city,
    state: property.state,
    zip: property.zip,
    description: property.description,
    internal_notes: property.internalNotes,
    client_notes: property.clientNotes,
    created_at: property.createdAt,
    updated_at: property.updatedAt,
  };
}

function propertyUpdates(property: Property) {
  const { user_id: _userId, id: _id, created_at: _createdAt, ...updates } =
    propertyToDatabase(property, "00000000-0000-0000-0000-000000000000");
  return updates;
}

function getFileExtension(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName)) {
    return fromName;
  }

  const fromType = file.type.split("/").pop()?.toLowerCase();
  return fromType && /^[a-z0-9]+$/.test(fromType) ? fromType : "jpg";
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState("");

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState("");

  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyPhotos, setPropertyPhotos] = useState<PropertyPhoto[]>([]);
  const [propertiesLoading, setPropertiesLoading] = useState(false);
  const [propertiesError, setPropertiesError] = useState("");

  const authUserIdRef = useRef<string | null>(null);
  const authRequestRef = useRef(0);

  function clearAccount() {
    authRequestRef.current += 1;
    authUserIdRef.current = null;
    setUser(null);
    setProjects([]);
    setContacts([]);
    setProperties([]);
    setPropertyPhotos([]);
    setProjectsError("");
    setContactsError("");
    setPropertiesError("");
    setProjectsLoading(false);
    setContactsLoading(false);
    setPropertiesLoading(false);
    setAuthLoading(false);

    localStorage.removeItem("ls_projects");
    localStorage.removeItem("ls_user");
    localStorage.removeItem("ls_registered");
  }

  async function loadProfile(authUser: SupabaseAuthUser, requestId: number) {
    const { data, error } = await supabase
      .from("profiles")
      .select("email, phone, full_name, company")
      .eq("id", authUser.id)
      .maybeSingle();

    if (requestId !== authRequestRef.current) return;

    if (error) {
      console.error("Could not load profile:", error.message);
      return;
    }

    if (data) {
      setUser(userFromProfile(authUser, data as ProfileRow));
    }
  }

  async function loadProjects(userId: string, requestId: number) {
    setProjectsLoading(true);
    setProjectsError("");

    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (requestId !== authRequestRef.current) return;

    if (error) {
      setProjects([]);
      setProjectsError(error.message);
      setProjectsLoading(false);
      return;
    }

    setProjects(((data ?? []) as ProjectRow[]).map(rowToProject));
    setProjectsLoading(false);
  }

  async function loadContacts(userId: string, requestId: number) {
    setContactsLoading(true);
    setContactsError("");

    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (requestId !== authRequestRef.current) return;

    if (error) {
      setContacts([]);
      setContactsError(error.message);
      setContactsLoading(false);
      return;
    }

    setContacts(((data ?? []) as ContactRow[]).map(rowToContact));
    setContactsLoading(false);
  }

  async function loadProperties(userId: string, requestId: number) {
    setPropertiesLoading(true);
    setPropertiesError("");

    const [propertiesResult, photosResult] = await Promise.all([
      supabase
        .from("properties")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false }),
      supabase
        .from("property_photos")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),
    ]);

    if (requestId !== authRequestRef.current) return;

    if (propertiesResult.error || photosResult.error) {
      setProperties([]);
      setPropertyPhotos([]);
      setPropertiesError(
        propertiesResult.error?.message ??
          photosResult.error?.message ??
          "Could not load properties."
      );
      setPropertiesLoading(false);
      return;
    }

    const loadedPhotos = await Promise.all(
      ((photosResult.data ?? []) as PropertyPhotoRow[]).map(rowToPropertyPhoto)
    );

    if (requestId !== authRequestRef.current) return;

    setProperties(
      ((propertiesResult.data ?? []) as PropertyRow[]).map(rowToProperty)
    );
    setPropertyPhotos(loadedPhotos);
    setPropertiesLoading(false);
  }

  async function loadAccount(authUser: SupabaseAuthUser) {
    const requestId = ++authRequestRef.current;
    authUserIdRef.current = authUser.id;
    setAuthLoading(true);
    setUser(userFromAuth(authUser));
    setProjects([]);
    setContacts([]);
    setProperties([]);
    setPropertyPhotos([]);

    await Promise.all([
      loadProfile(authUser, requestId),
      loadProjects(authUser.id, requestId),
      loadContacts(authUser.id, requestId),
      loadProperties(authUser.id, requestId),
    ]);

    if (requestId === authRequestRef.current) {
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

      if (!mounted) return;

      if (error) {
        console.error("Could not restore session:", error.message);
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
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === "SIGNED_OUT" || !session?.user) {
        clearAccount();
        return;
      }

      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "USER_UPDATED"
      ) {
        window.setTimeout(() => {
          if (mounted) void loadAccount(session.user);
        }, 0);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function login(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    return !error;
  }

  async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
    clearAccount();
  }

  async function register(newUser: User, password: string) {
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

  async function refreshProjects() {
    const userId = authUserIdRef.current;
    if (!userId) {
      setProjects([]);
      return;
    }
    await loadProjects(userId, authRequestRef.current);
  }

  async function refreshContacts() {
    const userId = authUserIdRef.current;
    if (!userId) {
      setContacts([]);
      return;
    }
    await loadContacts(userId, authRequestRef.current);
  }

  async function refreshProperties() {
    const userId = authUserIdRef.current;
    if (!userId) {
      setProperties([]);
      setPropertyPhotos([]);
      return;
    }
    await loadProperties(userId, authRequestRef.current);
  }

  async function addProject(project: Project) {
    const userId = authUserIdRef.current;
    if (!userId) throw new Error("You must be signed in to save an estimate.");

    setProjectsError("");
    const { data, error } = await supabase
      .from("projects")
      .insert(projectToDatabase(project, userId))
      .select("*")
      .single();

    if (error) {
      setProjectsError(error.message);
      throw new Error(error.message);
    }

    const savedProject = rowToProject(data as ProjectRow);
    setProjects((previous) => [
      savedProject,
      ...previous.filter((item) => item.id !== savedProject.id),
    ]);
    return savedProject;
  }

  async function updateProject(project: Project) {
    const userId = authUserIdRef.current;
    if (!userId) throw new Error("You must be signed in to update an estimate.");

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

    const savedProject = rowToProject(data as ProjectRow);
    setProjects((previous) =>
      previous.map((item) =>
        item.id === savedProject.id ? savedProject : item
      )
    );
    return savedProject;
  }

  async function setProjectSharing(id: string, enabled: boolean) {
    const userId = authUserIdRef.current;
    if (!userId) throw new Error("You must be signed in to share an estimate.");

    const { data, error } = await supabase
      .from("projects")
      .update({ share_enabled: enabled, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    const savedProject = rowToProject(data as ProjectRow);
    setProjects((previous) =>
      previous.map((item) =>
        item.id === savedProject.id ? savedProject : item
      )
    );
    return savedProject;
  }

  async function deleteProject(id: string) {
    const userId = authUserIdRef.current;
    if (!userId) throw new Error("You must be signed in to delete a project.");

    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) throw new Error(error.message);
    setProjects((previous) => previous.filter((project) => project.id !== id));
  }

  async function addContact(contact: Contact) {
    const userId = authUserIdRef.current;
    if (!userId) throw new Error("You must be signed in to add a contact.");

    setContactsError("");
    const { data, error } = await supabase
      .from("contacts")
      .insert(contactToDatabase(contact, userId))
      .select("*")
      .single();

    if (error) {
      setContactsError(error.message);
      throw new Error(error.message);
    }

    const savedContact = rowToContact(data as ContactRow);
    setContacts((previous) => [
      savedContact,
      ...previous.filter((item) => item.id !== savedContact.id),
    ]);
    return savedContact;
  }

  async function updateContact(contact: Contact) {
    const userId = authUserIdRef.current;
    if (!userId) throw new Error("You must be signed in to update a contact.");

    setContactsError("");
    const { data, error } = await supabase
      .from("contacts")
      .update(contactUpdates(contact))
      .eq("id", contact.id)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error) {
      setContactsError(error.message);
      throw new Error(error.message);
    }

    const savedContact = rowToContact(data as ContactRow);
    setContacts((previous) =>
      previous.map((item) =>
        item.id === savedContact.id ? savedContact : item
      )
    );
    return savedContact;
  }

  async function deleteContact(id: string) {
    const userId = authUserIdRef.current;
    if (!userId) throw new Error("You must be signed in to delete a contact.");

    const propertyIds = properties
      .filter((property) => property.contactId === id)
      .map((property) => property.id);
    const storagePaths = propertyPhotos
      .filter((photo) => propertyIds.includes(photo.propertyId))
      .map((photo) => photo.storagePath);

    if (storagePaths.length) {
      const { error: storageError } = await supabase.storage
        .from("property-photos")
        .remove(storagePaths);
      if (storageError) throw new Error(storageError.message);
    }

    const { error } = await supabase
      .from("contacts")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) throw new Error(error.message);

    setContacts((previous) => previous.filter((contact) => contact.id !== id));
    setProperties((previous) =>
      previous.filter((property) => property.contactId !== id)
    );
    setPropertyPhotos((previous) =>
      previous.filter((photo) => !propertyIds.includes(photo.propertyId))
    );
  }

  async function addProperty(property: Property) {
    const userId = authUserIdRef.current;
    if (!userId) throw new Error("You must be signed in to add a property.");

    setPropertiesError("");
    const { data, error } = await supabase
      .from("properties")
      .insert(propertyToDatabase(property, userId))
      .select("*")
      .single();

    if (error) {
      setPropertiesError(error.message);
      throw new Error(error.message);
    }

    const savedProperty = rowToProperty(data as PropertyRow);
    setProperties((previous) => [
      savedProperty,
      ...previous.filter((item) => item.id !== savedProperty.id),
    ]);
    return savedProperty;
  }

  async function updateProperty(property: Property) {
    const userId = authUserIdRef.current;
    if (!userId) throw new Error("You must be signed in to update a property.");

    setPropertiesError("");
    const { data, error } = await supabase
      .from("properties")
      .update(propertyUpdates(property))
      .eq("id", property.id)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error) {
      setPropertiesError(error.message);
      throw new Error(error.message);
    }

    const savedProperty = rowToProperty(data as PropertyRow);
    setProperties((previous) =>
      previous.map((item) =>
        item.id === savedProperty.id ? savedProperty : item
      )
    );
    return savedProperty;
  }

  async function deleteProperty(id: string) {
    const userId = authUserIdRef.current;
    if (!userId) throw new Error("You must be signed in to delete a property.");

    const storagePaths = propertyPhotos
      .filter((photo) => photo.propertyId === id)
      .map((photo) => photo.storagePath);

    if (storagePaths.length) {
      const { error: storageError } = await supabase.storage
        .from("property-photos")
        .remove(storagePaths);
      if (storageError) throw new Error(storageError.message);
    }

    const { error } = await supabase
      .from("properties")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) throw new Error(error.message);

    setProperties((previous) => previous.filter((property) => property.id !== id));
    setPropertyPhotos((previous) =>
      previous.filter((photo) => photo.propertyId !== id)
    );
    setProjects((previous) =>
      previous.map((project) =>
        project.propertyId === id
          ? { ...project, propertyId: null }
          : project
      )
    );
  }

  async function uploadPropertyPhoto(
    propertyId: string,
    file: File,
    caption = ""
  ) {
    const userId = authUserIdRef.current;
    if (!userId) throw new Error("You must be signed in to upload a photo.");
    if (!file.type.startsWith("image/")) {
      throw new Error("Choose an image file.");
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error("Each photo must be 10 MB or smaller.");
    }

    const photoId = globalThis.crypto.randomUUID();
    const path = `${userId}/${propertyId}/${photoId}.${getFileExtension(file)}`;

    const { error: uploadError } = await supabase.storage
      .from("property-photos")
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });

    if (uploadError) throw new Error(uploadError.message);

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("property_photos")
      .insert({
        id: photoId,
        user_id: userId,
        property_id: propertyId,
        storage_path: path,
        caption: caption.trim(),
        created_at: now,
      })
      .select("*")
      .single();

    if (error) {
      await supabase.storage.from("property-photos").remove([path]);
      throw new Error(error.message);
    }

    const savedPhoto = await rowToPropertyPhoto(data as PropertyPhotoRow);
    setPropertyPhotos((previous) => [...previous, savedPhoto]);
    return savedPhoto;
  }

  async function deletePropertyPhoto(photo: PropertyPhoto) {
    const userId = authUserIdRef.current;
    if (!userId) throw new Error("You must be signed in to delete a photo.");

    const { error: storageError } = await supabase.storage
      .from("property-photos")
      .remove([photo.storagePath]);
    if (storageError) throw new Error(storageError.message);

    const { error } = await supabase
      .from("property_photos")
      .delete()
      .eq("id", photo.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);

    setPropertyPhotos((previous) =>
      previous.filter((item) => item.id !== photo.id)
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
        contacts,
        contactsLoading,
        contactsError,
        properties,
        propertyPhotos,
        propertiesLoading,
        propertiesError,
        login,
        logout,
        register,
        refreshProjects,
        addProject,
        updateProject,
        deleteProject,
        setProjectSharing,
        refreshContacts,
        addContact,
        updateContact,
        deleteContact,
        refreshProperties,
        addProperty,
        updateProperty,
        deleteProperty,
        uploadPropertyPhoto,
        deletePropertyPhoto,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within AppProvider");
  }
  return context;
}
