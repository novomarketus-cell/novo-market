# NOVO MARKET 🌿

Premium Korean Baby & Kids Food E-Commerce

## 프로젝트 구조

```
novo-market/
├── index.html              ← 메인 HTML
├── package.json            ← 패키지 설정
├── vite.config.js          ← Vite 빌드 설정
├── vercel.json             ← Vercel 라우팅 설정
└── src/
    ├── main.jsx            ← 앱 진입점 (라우팅)
    ├── firebase.js         ← Firebase 설정 & 헬퍼 함수
    ├── novo-market-v2.jsx  ← 고객용 사이트
    └── novo-admin-dashboard.jsx ← 관리자 대시보드
```

## URL 구조

| 페이지 | URL |
|--------|-----|
| 고객용 사이트 | `yourdomain.com/` |
| 관리자 대시보드 | `yourdomain.com/admin` |

## 배포 방법

1. 이 레포를 GitHub에 업로드
2. [Vercel](https://vercel.com)에서 GitHub 연결
3. Import → Deploy 클릭
4. 끝!

## 기술 스택

- React 18 + Vite
- Firebase Firestore (데이터베이스)
- Firebase Storage (이미지/영상)
- Vercel (호스팅)
