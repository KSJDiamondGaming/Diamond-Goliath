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

Get-ChildItem .\src -Recurse -File |
>> ForEach-Object {
>>     $_.FullName.Replace((Get-Location).Path + "\", "")
>> } |
>> Sort-Object |
>> Out-File goliath-files.txt

/home/goliath/dev
/home/goliath/beta
/home/goliath/production

npm run build

git add .
git commit -m "Owner View fix"
git push origin dev

git checkout beta
git merge dev
git push origin beta

git checkout production
git merge beta
git push origin production

npm run dev

Validated one-shot source updates must finish their checks and land as a clean source commit before the normal dev deployment is triggered.
