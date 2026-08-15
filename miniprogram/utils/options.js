// utils/options.js —— 选项池常量（「值为文案」：选中的值即展示文案，直接入库）
// 云函数无法 require 本模块（部署根不同）；服务端只校验结构与数量，枚举值在前端约束。

const LOVE_GOALS = [
  '短期内想结婚',
  '认真谈场恋爱如果合适可以考虑结婚',
  '先认真谈场恋爱再说',
  '没考虑清楚',
];

const EMOTIONAL_STATUS = ['单身未婚', '离异', '丧偶'];

const FAMILY_BACKGROUND = [
  '独生子女', '有兄弟姐妹', '知识分子家庭', '领导高管', '做生意的',
  '国企事业单位', '家里有田', '拆二代', '爷爷奶奶带大',
  '在亲戚家长大', '单亲或离异', '父母有退休金',
];

const HABITS = ['从不', '偶尔', '经常']; // 吸烟/喝酒/打牌共用

const EDUCATIONS = ['高中及以下', '大专', '本科', '硕士', '博士'];

const JOBS = [
  '互联网/IT', '金融', '教育', '医疗', '政府/事业单位', '制造业',
  '商业/贸易', '文化传媒', '自由职业', '学生', '其他',
];

const ALBUM_CATEGORIES = ['日常生活', '兴趣爱好', '旅行经历', '家有萌宠', '健身运动'];

const TAG_POOLS = {
  hobby: ['旅行', '美食', '摄影', '运动', '游戏', '阅读', '音乐', '电影'],
  personality: ['开朗', '内向', '稳重', '幽默', '细心', '独立', '感性', '理性'],
  food: ['火锅', '烧烤', '日料', '川菜', '粤菜', '甜品', '咖啡', '小吃'],
  media: ['科幻', '悬疑', '喜剧', '纪录片', '动漫', '综艺', '美剧', '音乐剧'],
};

const STORY_TOPICS = [
  '我的周末', '一次难忘的旅行', '我为什么单身', '我的工作日常',
  '家庭对我的影响', '我最自豪的事', '理想的约会', '我的爱好',
  '未来五年规划', '我的爱情观', '难忘的友情', '家乡的味道',
];

const LIMITS = {
  ALBUM_MAX: 5,
  STORIES_MAX: 5,
  TAGS_PER_CATEGORY_MAX: 5,
  FAMILY_MAX: 12,
};

module.exports = {
  LOVE_GOALS, EMOTIONAL_STATUS, FAMILY_BACKGROUND, HABITS, EDUCATIONS, JOBS,
  ALBUM_CATEGORIES, TAG_POOLS, STORY_TOPICS, LIMITS,
};
