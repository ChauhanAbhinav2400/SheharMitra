import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ShopImage} from '../src/components/shop-image';

test('normalized shop uploads bypass the Next optimizer without enabling private-network fetching', () => {
  const url='http://localhost:4000/api/uploads/public/test-image';
  const element=ShopImage({src:url,alt:'Test shop',fill:true});
  assert.equal(element.props.src,url);
  assert.equal(element.props.unoptimized,true);
  assert.equal(element.props.fill,true);
});

test('ordinary static images retain the standard Next image behavior', () => {
  const element=ShopImage({src:'/shops/test.webp',alt:'Illustration',width:120,height:80});
  assert.equal(element.props.unoptimized,false);
});
