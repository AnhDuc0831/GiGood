import { GiGoodState, Job } from '../types'

export const SAMPLE_TASKERS = [
  { name: 'Minh Quân T.', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=150' },
  { name: 'Anh Hào D.', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=150' },
  { name: 'Thành Long P.', avatar: 'https://images.unsplash.com/photo-1633332755192-727a05c4013d?auto=format&fit=crop&q=80&w=150' },
]

export const INITIAL_JOBS: Job[] = [
  {
    id: 201,
    title: 'Vệ sinh laptop & cài lại Windows',
    category: 'repair',
    budget: 120000,
    location: '120 Nguyễn Huệ, Phường Bến Nghé, Quận 1',
    description: 'Máy tính bị nóng và chạy chậm, cần bạn sinh viên IT hỗ trợ vệ sinh quạt tản nhiệt và cài lại Windows.',
    status: 'assigned',
    seekerName: 'Khánh Vy',
    taskerName: 'Minh Quân T.',
    timeTag: '25 phút trước',
    chats: [
      { sender: 'tasker', text: 'Chào chị Vy, em là sinh viên IT vừa nhận việc vệ sinh máy tính của mình. Em chuẩn bị bộ vít và keo tản nhiệt rồi chạy qua liền đây chị nha.', time: '10:42' },
      { sender: 'seeker', text: 'Chào em, nhớ mang keo tản nhiệt tốt giúp chị nhé.', time: '10:44' },
      { sender: 'tasker', text: 'Dạ vâng ạ, keo tản nhiệt em có sẵn rồi, tầm 10 phút nữa em có mặt chị ạ.', time: '10:45' },
    ],
    seekerRating: null,
    taskerRating: null,
    isCompletedReportedByTasker: false,
    lat: 10.7769,
    lng: 106.7009,
  },
  {
    id: 202,
    title: 'Giao tài liệu & đồ án sinh viên gấp',
    category: 'delivery',
    budget: 45000,
    location: '88 Pasteur, Quận 1 đến KTX Đại học',
    description: 'Cần một bạn sinh viên giao gấp túi tài liệu và đồ án từ Pasteur sang KTX, giao cẩn thận tránh làm nhăn giấy.',
    status: 'finding',
    seekerName: 'Khánh Vy',
    taskerName: null,
    timeTag: '2 giờ trước',
    chats: [],
    seekerRating: null,
    taskerRating: null,
    isCompletedReportedByTasker: false,
    lat: 10.786,
    lng: 106.69,
  },
]

export function createInitialState(): GiGoodState {
  return {
    auth: {
      profile: null,
      currentRole: 'seeker',
      pendingBasicInfo: null,
      pendingSignupRole: 'seeker',
      hydrated: false,
    },
    ui: {
      activeSeekerSubTab: 'post',
      activeTaskerSubTab: 'board',
      activeChatId: null,
      chatDetailOpen: false,
      matchingJobIdRef: null,
      toast: null,
      bonusPopupOpen: false,
    },
    data: {
      jobs: INITIAL_JOBS,
    },
  }
}
