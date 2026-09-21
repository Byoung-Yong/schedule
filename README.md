# 전례 봉사 일정

공개 열람 + 비밀번호 수정이 가능한 간단한 전례 봉사 일정 웹앱입니다.

## 동작 방식

- 방문자는 일정을 바로 열람합니다.
- `수정` 버튼을 누르고 비밀번호를 입력하면 표를 수정할 수 있습니다.
- 저장 시 서버 함수가 비밀번호를 확인한 뒤 GitHub 저장소의 `data/schedule.json`을 갱신합니다.
- GitHub 토큰은 브라우저에 노출되지 않습니다.
- 모든 수정은 Git commit으로 남습니다.

## 배포

이 프로젝트는 GitHub 저장소에 올린 뒤 Vercel의 GitHub 연동으로 배포하는 구성을 기준으로 합니다.

Vercel 환경 변수:

- `EDIT_PASSWORD=maria1004`
- `GITHUB_OWNER=<GitHub 사용자명>`
- `GITHUB_REPO=<이 저장소 이름>`
- `GITHUB_BRANCH=main`
- `GITHUB_TOKEN=<fine-grained PAT>`

GitHub 토큰 권한은 이 저장소 하나에 대해서만 `Contents: Read and write`로 제한하는 것을 권장합니다.

> 순수 GitHub Pages만으로는 서버 측 비밀번호 검증과 안전한 GitHub 쓰기 토큰 보관을 할 수 없습니다. 따라서 정적 화면은 GitHub에서 관리하되, 수정 요청은 서버 함수에서 처리합니다.
