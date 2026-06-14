VPS:
/home/goliath/dev
/home/goliath/beta
/home/goliath/production

PM2:
goliath-dev
goliath-beta
goliath-production

npm run sync:dev
npm run promote:beta
npm run promote:production

tree /F > structure.txt
tree src /F > src-structure.txt

/home/goliath/dev
/home/goliath/beta
/home/goliath/production



git add .
git commit -m "Owner View fix"
git push origin dev


git checkout beta
git merge dev
git push origin beta

git checkout production
git merge beta
git push origin production