import { GiGoodState, Job } from '../types'

export const SAMPLE_TASKERS = [
  { name: 'Minh Quân T.', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=150' },
  { name: 'Anh Hào D.', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=150' },
  { name: 'Thành Long P.', avatar: 'https://images.unsplash.com/photo-1633332755192-727a05c4013d?auto=format&fit=crop&q=80&w=150' },
]

export const INITIAL_JOBS: Job[] = [
  {
    id: 201,
    title: 'Khơi thông thoát sàn toilet tràn nước',
    category: 'repair',
    budget: 150000,
    location: '120 Nguyễn Huệ, Phường Bến Nghé, Quận 1',
    description: 'Đường thoát nước phòng tắm bị tắc rác bẩn gây tràn. Cần thợ đem theo dây thông tắc lò xo dài tối thiểu 3m xử lý triệt để.',
    status: 'assigned',
    seekerName: 'Khánh Vy',
    taskerName: 'Minh Quân T.',
    timeTag: '25 phút trước',
    chats: [
      { sender: 'tasker', text: 'Chào chị Vy, em vừa nhận đơn thông thoát sàn của mình. Em chuẩn bị đồ đạc rồi chạy qua liền đây chị nha.', time: '10:42' },
      { sender: 'seeker', text: 'Chào em, nhớ mang theo máy thông tắc lò xo loại lớn nhé. Đường cống nhà chị dài lắm.', time: '10:44' },
      { sender: 'tasker', text: 'Dạ vâng ạ, máy lò xo em bỏ sẵn sau xe rồi, tầm 10 phút nữa em có mặt chị ạ.', time: '10:45' },
    ],
    seekerRating: null,
    taskerRating: null,
    isCompletedReportedByTasker: false,
    lat: 10.7769,
    lng: 106.7009,
  },
  {
    id: 202,
    title: 'Giao gấp hộp bánh ngọt cho khách hàng',
    category: 'delivery',
    budget: 45000,
    location: '88 Pasteur, Quận 1 đến Quận 3',
    description: 'Cần một bạn shipper chạy cẩn thận bọc màng khí tránh va đập hư hỏng trang trí mặt bánh.',
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
