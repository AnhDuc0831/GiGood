import { createContext, useContext, useReducer, type ReactNode } from "react";
import type {
    Category,
    GiGoodState,
    Role,
    ToastVariant,
    UserProfile,
} from "../types";
import { createInitialState, SAMPLE_TASKERS } from "./seed";

type Action =
  | { type: "REGISTER_ROLE"; payload: Role }
  | {
      type: "FINISH_SIGNUP_SEEKER";
      payload: { name: string; phone: string; location: string };
    }
  | {
      type: "FINISH_SIGNUP_TASKER";
      payload: {
        name: string;
        phone: string;
        location: string;
        taskerProfile: {
          skills: Category[];
          bio: string;
          availability:
            | "all-day"
            | "morning"
            | "afternoon"
            | "evening"
            | "weekend";
          vehicle: "motorbike" | "car" | "bicycle" | "none";
          verified: boolean;
        };
      };
    }
  | { type: "QUICK_LOGIN"; payload: Role }
  | { type: "SET_PROFILE"; payload: UserProfile }
  | { type: "SET_AUTH_HYDRATED"; payload: boolean }
  | { type: "SIGN_OUT" }
  | { type: "SWITCH_ROLE"; payload: Role }
  | {
      type: "SET_TEMP_SIGNUP_INFO";
      payload: { name: string; phone: string; location: string; password: string } | null;
    }
  | {
      type: "SET_SEEKER_SUB_TAB";
      payload: "post" | "jobs" | "chat" | "history";
    }
  | {
      type: "SET_TASKER_SUB_TAB";
      payload: "board" | "active" | "chat" | "earnings";
    }
  | {
      type: "POST_JOB";
      payload: {
        title: string;
        category: Category;
        description: string;
        budget: number;
        location: string;
      };
    }
  | { type: "START_MATCHING"; payload: number }
  | { type: "COMPLETE_MATCHING"; payload: number }
  | { type: "ACCEPT_JOB"; payload: { jobId: number; taskerName: string } }
  | { type: "REPORT_COMPLETED"; payload: number }
  | {
      type: "RELEASE_ESCROW";
      payload: { jobId: number; rating: number; comment: string };
    }
  | {
      type: "RATE_TASKER";
      payload: { jobId: number; rating: number; comment: string };
    }
  | {
      type: "SEND_CHAT";
      payload: { jobId: number; sender: Role; text: string; time?: string };
    }
  | { type: "SET_ACTIVE_CHAT"; payload: number | null }
  | { type: "SET_CHAT_DETAIL"; payload: boolean }
  | { type: "SHOW_TOAST"; payload: { message: string; variant: ToastVariant } }
  | { type: "HIDE_TOAST" }
  | { type: "SHOW_BONUS_POPUP" }
  | { type: "HIDE_BONUS_POPUP" };

let nextJobId = 300;

function reducer(state: GiGoodState, action: Action): GiGoodState {
  switch (action.type) {
    case "REGISTER_ROLE":
      return {
        ...state,
        auth: { ...state.auth, pendingSignupRole: action.payload },
      };

    case "FINISH_SIGNUP_SEEKER": {
      const profile: UserProfile = {
        id: "local-seeker",
        name: action.payload.name,
        avatar:
          "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=150",
        role: "seeker",
        phone: action.payload.phone,
        location: action.payload.location,
        taskerProfile: null,
      };
      return {
        ...state,
        auth: { ...state.auth, profile, currentRole: "seeker" },
      };
    }

    case "FINISH_SIGNUP_TASKER": {
      const profile: UserProfile = {
        id: "local-tasker",
        name: action.payload.name,
        avatar:
          "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=150",
        role: "tasker",
        phone: action.payload.phone,
        location: action.payload.location,
        taskerProfile: action.payload.taskerProfile,
      };
      return {
        ...state,
        auth: { ...state.auth, profile, currentRole: "tasker" },
      };
    }

    case "QUICK_LOGIN": {
      const isSeeker = action.payload === "seeker";
      const profile: UserProfile = isSeeker
        ? {
            id: "demo-seeker",
            name: "Khánh Vy",
            avatar:
              "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=150",
            role: "seeker",
            phone: "0901 234 567",
            location: "Quận 1, TP. Hồ Chí Minh",
            taskerProfile: null,
          }
        : {
            id: "demo-tasker",
            name: "Minh Quân",
            avatar:
              "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=150",
            role: "tasker",
            phone: "0938 765 432",
            location: "Quận 3, TP. Hồ Chí Minh",
            taskerProfile: {
              skills: ["repair", "helper"] as Category[],
              bio: "Mình có 2 năm kinh nghiệm sửa chữa điện nước và phụ việc nhà, làm cẩn thận và đúng giờ.",
              availability: "all-day" as const,
              vehicle: "motorbike" as const,
              verified: false,
            },
          };
      return {
        ...state,
        auth: { ...state.auth, profile, currentRole: action.payload },
      };
    }

    case "SET_TEMP_SIGNUP_INFO":
      return {
        ...state,
        auth: { ...state.auth, pendingBasicInfo: action.payload },
      };

    case "SET_PROFILE":
      return {
        ...state,
        auth: {
          ...state.auth,
          profile: action.payload,
          currentRole: action.payload.role,
        },
      };

    case "SET_AUTH_HYDRATED":
      return {
        ...state,
        auth: { ...state.auth, hydrated: action.payload },
      };

    case "SIGN_OUT":
      return {
        ...state,
        auth: { ...state.auth, profile: null },
        ui: { ...createInitialState().ui },
        data: { ...createInitialState().data },
      };

    case "SWITCH_ROLE":
      return {
        ...state,
        auth: {
          ...state.auth,
          currentRole: action.payload,
          profile: state.auth.profile
            ? { ...state.auth.profile, role: action.payload }
            : null,
        },
        ui: {
          ...state.ui,
          activeSeekerSubTab: "post",
          activeTaskerSubTab: "board",
        },
      };

    case "SET_SEEKER_SUB_TAB":
      return {
        ...state,
        ui: { ...state.ui, activeSeekerSubTab: action.payload },
      };

    case "SET_TASKER_SUB_TAB":
      return {
        ...state,
        ui: { ...state.ui, activeTaskerSubTab: action.payload },
      };

    case "POST_JOB": {
      const newJob = {
        id: nextJobId++,
        title: action.payload.title,
        category: action.payload.category,
        budget: action.payload.budget,
        location: action.payload.location,
        description: action.payload.description,
        status: "finding" as const,
        seekerName: state.auth.profile?.name || "Khách hàng",
        taskerName: null as string | null,
        timeTag: "Vừa đăng",
        chats: [] as { sender: Role; text: string; time: string }[],
        seekerRating: null as number | null,
        taskerRating: null as number | null,
        isCompletedReportedByTasker: false,
        lat: 10.7769 + (Math.random() - 0.5) * 0.04,
        lng: 106.7009 + (Math.random() - 0.5) * 0.04,
      };
      return {
        ...state,
        data: { ...state.data, jobs: [newJob, ...state.data.jobs] },
      };
    }

    case "START_MATCHING":
      return {
        ...state,
        ui: { ...state.ui, matchingJobIdRef: action.payload },
      };

    case "COMPLETE_MATCHING": {
      const job = state.data.jobs.find((j) => j.id === action.payload);
      if (!job || job.status !== "finding") return state;
      const picked =
        SAMPLE_TASKERS[Math.floor(Math.random() * SAMPLE_TASKERS.length)];
      const nowStr = `${new Date().getHours().toString().padStart(2, "0")}:${new Date().getMinutes().toString().padStart(2, "0")}`;
      const updatedJobs = state.data.jobs.map((j) =>
        j.id === action.payload
          ? {
              ...j,
              status: "assigned" as const,
              taskerName: picked.name,
              timeTag: "Vừa ghép việc",
              chats: [
                ...j.chats,
                {
                  sender: "tasker" as const,
                  text: `Chào ${j.seekerName}, mình vừa nhận việc "${j.title.substring(0, 30)}" của bạn. Mình sẽ liên hệ chi tiết hơn ngay đây nhé!`,
                  time: nowStr,
                },
              ],
            }
          : j,
      );
      return {
        ...state,
        data: {
          ...state.data,
          jobs: updatedJobs,
        },
        ui: {
          ...state.ui,
          matchingJobIdRef: null,
        },
      };
    }

    case "ACCEPT_JOB": {
      const acceptJob = state.data.jobs.find(
        (j) => j.id === action.payload.jobId,
      );
      if (!acceptJob || acceptJob.status !== "finding") return state;
      const nowStr = `${new Date().getHours().toString().padStart(2, "0")}:${new Date().getMinutes().toString().padStart(2, "0")}`;
      const updatedJobs = state.data.jobs.map((j) =>
        j.id === action.payload.jobId
          ? {
              ...j,
              status: "assigned" as const,
              taskerName: action.payload.taskerName,
              timeTag: "Vừa nhận",
              chats: [
                ...j.chats,
                {
                  sender: "tasker" as const,
                  text: `Chào ${j.seekerName}, mình vừa nhận việc "${j.title.substring(0, 30)}" của bạn. Mình sẽ liên hệ chi tiết hơn ngay đây nhé!`,
                  time: nowStr,
                },
              ],
            }
          : j,
      );
      return {
        ...state,
        data: {
          ...state.data,
          jobs: updatedJobs,
        },
        ui: {
          ...state.ui,
          activeTaskerSubTab: "active",
        },
      };
    }

    case "REPORT_COMPLETED": {
      const updatedJobs = state.data.jobs.map((j) =>
        j.id === action.payload
          ? { ...j, isCompletedReportedByTasker: true }
          : j,
      );
      return {
        ...state,
        data: { ...state.data, jobs: updatedJobs },
      };
    }

    case "RELEASE_ESCROW": {
      const releaseJob = state.data.jobs.find(
        (j) => j.id === action.payload.jobId,
      );
      if (!releaseJob) return state;
      const updatedJobs = state.data.jobs.map((j) =>
        j.id === action.payload.jobId
          ? {
              ...j,
              status: "completed" as const,
              taskerRating: action.payload.rating,
            }
          : j,
      );
      return {
        ...state,
        data: {
          ...state.data,
          jobs: updatedJobs,
        },
      };
    }

    case "RATE_TASKER": {
      const updatedJobs = state.data.jobs.map((j) =>
        j.id === action.payload.jobId
          ? { ...j, taskerRating: action.payload.rating }
          : j,
      );
      return { ...state, data: { ...state.data, jobs: updatedJobs } };
    }

    case "SEND_CHAT": {
      const updatedJobs = state.data.jobs.map((j) =>
        j.id === action.payload.jobId
          ? {
              ...j,
              chats: [
                ...j.chats,
                {
                  sender: action.payload.sender,
                  text: action.payload.text,
                  time:
                    action.payload.time ||
                    `${new Date().getHours().toString().padStart(2, "0")}:${new Date().getMinutes().toString().padStart(2, "0")}`,
                },
              ],
            }
          : j,
      );
      return { ...state, data: { ...state.data, jobs: updatedJobs } };
    }

    case "SET_ACTIVE_CHAT":
      return { ...state, ui: { ...state.ui, activeChatId: action.payload } };

    case "SET_CHAT_DETAIL":
      return { ...state, ui: { ...state.ui, chatDetailOpen: action.payload } };

    case "SHOW_TOAST":
      return {
        ...state,
        ui: {
          ...state.ui,
          toast: {
            message: action.payload.message,
            variant: action.payload.variant,
            visible: true,
          },
        },
      };

    case "HIDE_TOAST":
      return {
        ...state,
        ui: {
          ...state.ui,
          toast: state.ui.toast ? { ...state.ui.toast, visible: false } : null,
        },
      };

    case "SHOW_BONUS_POPUP":
      return {
        ...state,
        ui: { ...state.ui, bonusPopupOpen: true }
      };

    case "HIDE_BONUS_POPUP":
      return {
        ...state,
        ui: { ...state.ui, bonusPopupOpen: false }
      };

    default:
      return state;
  }
}

const GiGoodCtx = createContext<{
  state: GiGoodState;
  dispatch: React.Dispatch<Action>;
} | null>(null);

export function GiGoodProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  return (
    <GiGoodCtx.Provider value={{ state, dispatch }}>
      {children}
    </GiGoodCtx.Provider>
  );
}

export function useGiGood() {
  const ctx = useContext(GiGoodCtx);
  if (!ctx) throw new Error("useGiGood must be used within GiGoodProvider");
  return ctx;
}
